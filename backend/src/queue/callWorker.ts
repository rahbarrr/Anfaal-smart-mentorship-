import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { Call } from '../models/Call.js';
import { CallProcessingJob } from '../models/CallProcessingJob.js';
import { createStorageProvider } from '../services/storageService.js';
import { createTranscriptionService } from '../services/transcriptionService.js';
import { createAiSummaryService } from '../services/aiSummaryService.js';
import { logAuditEvent } from '../services/auditService.js';
import { CallProcessingJobData, createRedisConnection, QUEUE_NAMES } from './callQueue.js';
import { boundedText } from '../services/chunking.js';
import { invalidateCache } from '../services/cacheService.js';

export async function processCallProcessingJob(
  data: CallProcessingJobData,
  attemptsMade = 0,
  attempts = 1,
): Promise<void> {
  const { callId, jobId, mentorNotes, skipTranscription } = data;
  const pipelineStartedAt = Date.now();
  let currentStage: 'transcription' | 'summary' = 'transcription';

  const updateJob = async (fields: Record<string, unknown>) => {
    await CallProcessingJob.findByIdAndUpdate(jobId, { $set: fields });
  };

  const call = await Call.findById(callId);
  if (!call) {
    console.error(`[CALL_PROCESSING_FAILED] callId=${callId} error=call_not_found`);
    await updateJob({
      status: 'FAILED',
      error: 'Call record was not found. Please contact support.',
      completedAt: new Date(),
    });
    return;
  }
  const shouldSkipTranscription = Boolean(
    skipTranscription || (call.transcription?.status === 'COMPLETED' && (call.transcription?.text || call.transcript)),
  );

  try {
    console.info(`[CALL_PROCESSING_START] callId=${callId} attempt=${attemptsMade + 1}`);
    await Call.findByIdAndUpdate(callId, {
      $set: {
        processingStatus: 'processing',
      },
    });
    await updateJob({
      stage: 'TRANSCRIPTION',
      status: 'PROCESSING',
      progress: 10,
      'stageStatus.audioProcessing': 'PROCESSING',
      'stageStatus.transcription': 'PENDING',
      startedAt: new Date(),
      error: '',
    });

    let transcriptText = call.transcript || call.transcription?.text || '';
    let segments = call.transcription?.segments ?? [];
    let transcriptionDuration = call.transcription?.duration;

    // ── Stage 1: Transcription ────────────────────────────────────────────────
    if (!shouldSkipTranscription) {
      const storageKey = call.recording?.storageKey || data.storageKey;
      if (!storageKey) {
        // No audio uploaded (e.g. notes only session)
        await updateJob({
          progress: 50,
          'stageStatus.audioProcessing': 'COMPLETED',
          'stageStatus.transcription': 'COMPLETED',
        });
      } else {
        try {
          const storageProvider = createStorageProvider();
          const audioLoadStartedAt = Date.now();
          const audioBuffer = await storageProvider.getObjectBuffer(storageKey);
          const fileName = call.recording?.fileName || 'recording.m4a';
          const mimeType = call.recording?.mimeType || 'audio/mpeg';

          console.info(`[Worker] Audio loaded in ${Date.now() - audioLoadStartedAt}ms: ${audioBuffer?.length ?? 0} bytes, file=${fileName}, mime=${mimeType}`);

          if (!audioBuffer || audioBuffer.length === 0) {
            throw new Error('Audio file retrieved from storage is empty.');
          }

          await updateJob({
            progress: 25,
            'stageStatus.audioProcessing': 'COMPLETED',
            'stageStatus.transcription': 'PROCESSING',
          });

          const transcriptionStartedAt = Date.now();
          console.info(`[CALL_TRANSCRIPTION_START] callId=${callId}`);
          const transcriptionService = createTranscriptionService();
          const result = await transcriptionService.transcribe({
            buffer: audioBuffer,
            originalname: fileName,
            mimetype: mimeType,
          });
          console.info(`[CALL_TRANSCRIPTION_SUCCESS] callId=${callId} durationMs=${Date.now() - transcriptionStartedAt}`);

          transcriptText = result.text;
          segments = (result.segments ?? []).map((s) => ({
            start: s.start,
            end: s.end,
            text: s.text,
            speaker: s.speaker,
          }));
          transcriptionDuration = result.duration;

          await Call.findByIdAndUpdate(callId, {
            $set: {
              transcript: transcriptText,
              'transcription.status': 'COMPLETED',
              'transcription.text': transcriptText,
              'transcription.segments': segments,
              'transcription.duration': transcriptionDuration,
              'transcription.language': result.language || 'en',
              'transcription.provider': result.provider || 'openai-whisper',
              'transcription.createdAt': new Date(),
            },
          });

          await updateJob({
            progress: 50,
            'stageStatus.transcription': 'COMPLETED',
          });
        } catch (transcriptionErr) {
          currentStage = 'transcription';
          throw transcriptionErr;
        }
      }
    } else {
      // Transcription was already completed; advance progress
      await updateJob({
        progress: 50,
        'stageStatus.audioProcessing': 'COMPLETED',
        'stageStatus.transcription': 'COMPLETED',
      });
    }

    // ── Stage 2: AI Summarization ─────────────────────────────────────────────
    currentStage = 'summary';
    console.info(`[CALL_SUMMARY_START] callId=${callId}`);
    await updateJob({
      stage: 'SUMMARY',
      progress: 60,
      'stageStatus.summary': 'PROCESSING',
    });

    try {
      const summaryStartedAt = Date.now();
      const refreshedCall = call && typeof (call as any).toObject === 'function' ? (call as any).toObject() : call;
      const aiSummaryService = createAiSummaryService();

      const summaryResult = await aiSummaryService.summarize({
        transcript: boundedText(transcriptText || (refreshedCall?.transcript ?? '')),
        mentorNotes: mentorNotes || refreshedCall?.mentorNotes,
        metadata: {
          mentorName: 'Mentor',
          menteeName: 'Mentee',
          date: refreshedCall?.date ? new Date(refreshedCall.date).toISOString() : undefined,
          duration: refreshedCall?.duration,
        },
      });
      console.info(`[CALL_SUMMARY_SUCCESS] callId=${callId} durationMs=${Date.now() - summaryStartedAt}`);

      const versionEntry = {
        version: (refreshedCall?.summaryVersions?.length ?? 0) + 1,
        type: 'AI' as const,
        content: summaryResult,
        timestamp: new Date(),
        author: 'system',
      };

      await Call.findByIdAndUpdate(callId, {
        $set: {
          summary: summaryResult.shortSummary,
          keyDiscussionPoints: summaryResult.keyDiscussionPoints,
          studentConcerns: summaryResult.studentConcerns,
          actionItems: summaryResult.actionItems,
          followUpRecommendations: summaryResult.followUpRecommendations,
          topicsDiscussed: summaryResult.topicsDiscussed,
          aiStatus: 'completed',
          'aiSummary.status': 'COMPLETED',
          'aiSummary.shortSummary': summaryResult.shortSummary,
          'aiSummary.keyDiscussionPoints': summaryResult.keyDiscussionPoints,
          'aiSummary.academicProgress': summaryResult.academicProgress,
          'aiSummary.personalDevelopment': summaryResult.personalDevelopment,
          'aiSummary.challenges': summaryResult.challenges,
          'aiSummary.achievements': summaryResult.achievements,
          'aiSummary.actionItems': summaryResult.actionItems,
          'aiSummary.mentorCommitments': summaryResult.mentorCommitments,
          'aiSummary.menteeCommitments': summaryResult.menteeCommitments,
          'aiSummary.followUpTopics': summaryResult.followUpTopics,
          'aiSummary.topicsDiscussed': summaryResult.topicsDiscussed,
          'aiSummary.generatedAt': new Date(),
          processingStatus: 'completed',
          reviewStatus: 'Pending Review',
          'mentorReview.status': 'Pending Review',
        },
        $push: { summaryVersions: versionEntry },
      });

      await updateJob({
        stage: 'COMPLETE',
        status: 'COMPLETED',
        progress: 100,
        'stageStatus.summary': 'COMPLETED',
        'stageStatus.mentorReview': 'READY',
        completedAt: new Date(),
      });
      await invalidateCache('dashboard:summary');

      console.info(`[CALL_PROCESSING_COMPLETE] callId=${callId} durationMs=${Date.now() - pipelineStartedAt}`);
    } catch (summaryErr) {
      currentStage = 'summary';
      throw summaryErr;
    }
  } catch (fatalErr) {
    const errMsg = fatalErr instanceof Error ? fatalErr.message : String(fatalErr);
    const willRetry = attemptsMade + 1 < attempts;
    const safeError = currentStage === 'transcription'
      ? 'Transcription failed. Processing will retry.'
      : 'AI summary failed. Processing will retry.';
    const finalError = currentStage === 'transcription'
      ? 'Transcription failed. Please retry processing.'
      : 'AI summary failed. Please retry processing.';
    console.error(`[CALL_PROCESSING_FAILED] callId=${callId} stage=${currentStage} attempt=${attemptsMade + 1}/${attempts} retry=${willRetry} error=${errMsg}`);

    await Call.findByIdAndUpdate(callId, {
      $set: {
        processingStatus: willRetry ? 'queued' : 'failed',
        ...(currentStage === 'transcription'
          ? { 'transcription.status': willRetry ? 'PENDING' : 'FAILED' }
          : { 'aiSummary.status': willRetry ? 'PENDING' : 'FAILED', aiStatus: willRetry ? 'pending' : 'failed' }),
      },
    });

    await updateJob({
      status: willRetry ? 'PENDING' : 'FAILED',
      [`stageStatus.${currentStage}`]: willRetry ? 'PENDING' : 'FAILED',
      error: willRetry ? safeError : finalError,
      ...(willRetry ? {} : { completedAt: new Date() }),
    });

    logAuditEvent({
      userId: call.mentorId,
      userRole: 'MENTOR',
      action: 'PROCESSING_FAILED',
      targetType: 'CALL',
      targetId: callId,
      details: finalError,
    });
    throw fatalErr;
  }
}

export function startCallWorker(connection: Redis = createRedisConnection()): Worker<CallProcessingJobData> {
  const worker = new Worker<CallProcessingJobData>(
    QUEUE_NAMES.callProcessing,
    async (job: Job<CallProcessingJobData>) => {
      console.log(`[Worker] Processing job ${job.id} for call ${job.data.callId}`);
      await processCallProcessingJob(job.data, job.attemptsMade, Number(job.opts.attempts || 1));
    },
    {
      connection,
      concurrency: Math.max(1, Number(process.env.WORKER_CONCURRENCY || 3)),
    },
  );

  worker.on('error', (err: Error) => {
    console.warn('[Worker Service] BullMQ worker warning:', err.message);
  });

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[CALL_PROCESSING_FAILED] callId=${job?.data.callId ?? 'unknown'} jobId=${job?.id ?? 'unknown'} error=${err.message}`);
  });

  return worker;
}
