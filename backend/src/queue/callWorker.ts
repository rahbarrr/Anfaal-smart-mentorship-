import { Worker, Job } from 'bullmq';
import { Call } from '../models/Call.js';
import { CallProcessingJob } from '../models/CallProcessingJob.js';
import { createStorageProvider } from '../services/storageService.js';
import { createTranscriptionService } from '../services/transcriptionService.js';
import { createAiSummaryService } from '../services/aiSummaryService.js';
import { logAuditEvent } from '../services/auditService.js';
import { CallProcessingJobData, createRedisConnection, QUEUE_NAMES } from './callQueue.js';
import { boundedText } from '../services/chunking.js';
import { invalidateCache } from '../services/cacheService.js';

export async function processCallProcessingJob(data: CallProcessingJobData): Promise<void> {
  const { callId, jobId, mentorNotes, skipTranscription } = data;
  const pipelineStartedAt = Date.now();

  const updateJob = async (fields: Record<string, unknown>) => {
    await CallProcessingJob.findByIdAndUpdate(jobId, { $set: fields });
  };

  const call = await Call.findById(callId);
  if (!call) {
    await updateJob({
      status: 'FAILED',
      error: `Call with ID ${callId} not found.`,
      completedAt: new Date(),
    });
    return;
  }

  try {
    await updateJob({
      stage: 'TRANSCRIPTION',
      status: 'PROCESSING',
      progress: 10,
      'stageStatus.audioProcessing': 'PROCESSING',
      'stageStatus.transcription': 'PENDING',
      startedAt: new Date(),
    });

    let transcriptText = call.transcript || call.transcription?.text || '';
    let segments = call.transcription?.segments ?? [];
    let transcriptionDuration = call.transcription?.duration;

    // ── Stage 1: Transcription ────────────────────────────────────────────────
    if (!skipTranscription) {
      const storageKey = call.recording?.storageKey;
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
          const transcriptionService = createTranscriptionService();
          const result = await transcriptionService.transcribe({
            buffer: audioBuffer,
            originalname: fileName,
            mimetype: mimeType,
          });
          console.info(`[Worker] Transcription completed in ${Date.now() - transcriptionStartedAt}ms for call ${callId}`);

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
          const errMsg = transcriptionErr instanceof Error ? transcriptionErr.message : String(transcriptionErr);
          console.error(`[Worker] Transcription failed for call ${callId}:`, errMsg);

          await Call.findByIdAndUpdate(callId, {
            $set: {
              'transcription.status': 'FAILED',
              recordingStatus: 'failed',
            },
          });

          await updateJob({
            status: 'FAILED',
            progress: 50,
            'stageStatus.transcription': 'FAILED',
            error: `Transcription error: ${errMsg}`,
            completedAt: new Date(),
          });

          logAuditEvent({
            userId: call.mentorId,
            userRole: 'MENTOR',
            action: 'PROCESSING_FAILED',
            targetType: 'CALL',
            targetId: callId,
            details: `Transcription failed: ${errMsg}`,
          });

          return; // Stop pipeline on transcription failure
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
      console.info(`[Worker] AI summary completed in ${Date.now() - summaryStartedAt}ms for call ${callId}`);

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

      console.info(`[Worker] Total processing time for call ${callId}: ${Date.now() - pipelineStartedAt}ms`);
    } catch (summaryErr) {
      const errMsg = summaryErr instanceof Error ? summaryErr.message : String(summaryErr);
      console.error(`[Worker] AI Summary failed for call ${callId}:`, errMsg);

      // Preserve transcript, mark only AI summary as FAILED
      await Call.findByIdAndUpdate(callId, {
        $set: {
          'aiSummary.status': 'FAILED',
          aiStatus: 'failed',
        },
      });

      await updateJob({
        status: 'FAILED',
        progress: 75,
        'stageStatus.summary': 'FAILED',
        error: `AI summary error: ${errMsg}`,
        completedAt: new Date(),
      });

      logAuditEvent({
        userId: call.mentorId,
        userRole: 'MENTOR',
        action: 'PROCESSING_FAILED',
        targetType: 'CALL',
        targetId: callId,
        details: `AI Summary failed: ${errMsg}`,
      });
    }
  } catch (fatalErr) {
    const errMsg = fatalErr instanceof Error ? fatalErr.message : String(fatalErr);
    console.error(`[Worker] Fatal pipeline error for call ${callId}:`, errMsg);

    await updateJob({
      status: 'FAILED',
      error: `Fatal pipeline error: ${errMsg}`,
      completedAt: new Date(),
    });

    logAuditEvent({
      userId: call.mentorId,
      userRole: 'MENTOR',
      action: 'PROCESSING_FAILED',
      targetType: 'CALL',
      targetId: callId,
      details: `Processing failed: ${errMsg}`,
    });
  }
}

export function startCallWorker(): Worker<CallProcessingJobData> {
  const connection = createRedisConnection();

  const worker = new Worker<CallProcessingJobData>(
    QUEUE_NAMES.callProcessing,
    async (job: Job<CallProcessingJobData>) => {
      console.log(`[Worker] Processing job ${job.id} for call ${job.data.callId}`);
      await processCallProcessingJob(job.data);
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
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
