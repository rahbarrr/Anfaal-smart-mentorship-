import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { Call } from '../models/Call.js';
import { CallProcessingJob } from '../models/CallProcessingJob.js';
import { createStorageProvider } from '../services/storageService.js';
import { createTranscriptionService, MAX_TRANSCRIPTION_FILE_BYTES } from '../services/transcriptionService.js';
import { createAiSummaryService } from '../services/aiSummaryService.js';
import { logAuditEvent } from '../services/auditService.js';
import { CallProcessingJobData, createRedisConnection, QUEUE_NAMES } from './callQueue.js';
import { boundedText } from '../services/chunking.js';
import { invalidateCache } from '../services/cacheService.js';
import { transcribeAudioInChunks } from '../services/chunkedTranscriptionService.js';
import { classifyProcessingError } from '../services/processingErrorService.js';
import { notifyCallCompletion, notifyCallFailure } from '../services/notificationService.js';
import { extractProfileFromCall } from '../services/profileExtractionService.js';

export function isJobRunnable(status: string): boolean {
  return status === 'PENDING' || status === 'PROCESSING';
}

class JobFencedError extends Error {
  constructor() {
    super('Processing job was superseded by recovery.');
    this.name = 'JobFencedError';
  }
}

export async function processCallProcessingJob(
  data: CallProcessingJobData,
  attemptsMade = 0,
  attempts = 1,
): Promise<void> {
  const { callId, jobId, mentorNotes, skipTranscription } = data;
  const pipelineStartedAt = Date.now();
  let currentStage: 'transcription' | 'summary' = 'transcription';

  // Recovery can replace a stale database job while the original BullMQ
  // delivery is still active. Fence that old delivery before it touches the
  // call or sends another transcription request.
  const existingJob = await CallProcessingJob.findById(jobId).select('status createdAt').lean();
  if (!existingJob || !isJobRunnable(existingJob.status)) {
    console.warn(`[CALL_PROCESSING_SKIPPED] callId=${callId} jobId=${jobId} reason=job_fenced`);
    return;
  }

  const updateJob = async (fields: Record<string, unknown>) => {
    const updated = await CallProcessingJob.findOneAndUpdate(
      { _id: jobId, status: { $in: ['PENDING', 'PROCESSING'] } },
      { $set: { ...fields, heartbeatAt: new Date() } },
      { new: true },
    ).select('_id');
    if (!updated) throw new JobFencedError();
  };

  const assertJobActive = async () => {
    const activeJob = await CallProcessingJob.findOne({
      _id: jobId,
      status: { $in: ['PENDING', 'PROCESSING'] },
    }).select('_id').lean();
    if (!activeJob) throw new JobFencedError();
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
    await assertJobActive();
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
      'timings.queueWaitMs': existingJob.createdAt ? Math.max(0, Date.now() - new Date(existingJob.createdAt).getTime()) : 0,
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
          const audioLoadMs = Date.now() - audioLoadStartedAt;
          const fileName = call.recording?.fileName || 'recording.m4a';
          const mimeType = call.recording?.mimeType || 'audio/mpeg';

          console.info(`[Worker] Audio loaded in ${audioLoadMs}ms: ${audioBuffer?.length ?? 0} bytes, file=${fileName}, mime=${mimeType}`);

          if (!audioBuffer || audioBuffer.length === 0) {
            throw new Error('Audio file retrieved from storage is empty.');
          }

          await updateJob({
            progress: 25,
            'stageStatus.audioProcessing': 'COMPLETED',
            'stageStatus.transcription': 'PROCESSING',
            'timings.audioLoadMs': audioLoadMs,
          });

          const transcriptionStartedAt = Date.now();
          const chunked = process.env.CHUNKED_TRANSCRIPTION === 'true'
            || (call.recording?.fileSize ?? 0) > MAX_TRANSCRIPTION_FILE_BYTES;
          const configuredChunkConcurrency = Number(process.env.TRANSCRIPTION_CONCURRENCY || 4);
          const configuredMaxConcurrency = Number(process.env.TRANSCRIPTION_MAX_CONCURRENCY || 6);
          const maxChunkConcurrency = Number.isFinite(configuredMaxConcurrency) && configuredMaxConcurrency > 0
            ? Math.floor(configuredMaxConcurrency)
            : 6;
          const chunkConcurrency = Number.isFinite(configuredChunkConcurrency) && configuredChunkConcurrency > 0
            ? Math.min(Math.floor(configuredChunkConcurrency), maxChunkConcurrency)
            : 1;
          const configuredChunkSeconds = Number(process.env.TRANSCRIPTION_CHUNK_SECONDS || 90);
          const chunkSeconds = Number.isFinite(configuredChunkSeconds) && configuredChunkSeconds > 0
            ? configuredChunkSeconds
            : 90;
          const configuredChunkAttempts = Number(process.env.TRANSCRIPTION_CHUNK_ATTEMPTS || 3);
          const chunkAttempts = Number.isFinite(configuredChunkAttempts) && configuredChunkAttempts > 0
            ? Math.floor(configuredChunkAttempts)
            : 3;
          let failedChunks = 0;
          console.info(`[CALL_TRANSCRIPTION_START] callId=${callId} mode=${chunked ? 'chunked' : 'single-file'} concurrency=${chunked ? chunkConcurrency : 1} chunkSeconds=${chunked ? chunkSeconds : 0}`);
          const result = chunked
            ? await transcribeAudioInChunks({
              buffer: audioBuffer,
              originalname: fileName,
              mimetype: mimeType,
              concurrency: chunkConcurrency,
              chunkSeconds,
              maxAttempts: chunkAttempts,
              onChunksPrepared: async (total, durationSeconds) => {
                await updateJob({
                  progress: 25,
                  chunkProgress: { total, completed: 0, failed: 0 },
                  'timings.audioDurationSeconds': durationSeconds,
                });
              },
              onChunkCompleted: async (_chunk, completed, total) => {
                if (_chunk.error) failedChunks += 1;
                const transcriptionProgress = 25 + Math.round((completed / Math.max(total, 1)) * 25);
                await updateJob({
                  progress: transcriptionProgress,
                  chunkProgress: {
                    total,
                    completed,
                    failed: failedChunks,
                    lastChunkAt: new Date(),
                  },
                  'stageStatus.audioProcessing': 'COMPLETED',
                  'stageStatus.transcription': completed === total && !_chunk.error ? 'COMPLETED' : 'PROCESSING',
                });
              },
            })
            : await createTranscriptionService().transcribe({
              buffer: audioBuffer,
              originalname: fileName,
              mimetype: mimeType,
            });
          const transcriptionMs = Date.now() - transcriptionStartedAt;
          console.info(`[CALL_TRANSCRIPTION_SUCCESS] callId=${callId} durationMs=${Date.now() - transcriptionStartedAt}`);

          if ('partial' in result && result.partial) {
            const failedChunkIndexes = result.chunks.filter((chunk) => chunk.error).map((chunk) => chunk.index).join(', ');
            throw new Error(`Transcription failed for audio chunk(s): ${failedChunkIndexes || 'unknown'}.`);
          }

          transcriptText = result.text;
          segments = (result.segments ?? []).map((s) => ({
            start: s.start,
            end: s.end,
            text: s.text,
            speaker: s.speaker,
          }));
          transcriptionDuration = result.duration;

          if ('preparationMs' in result) {
            await updateJob({
              'timings.audioPreparationMs': result.preparationMs,
              'timings.chunkCount': result.chunkCount,
              'timings.chunkSeconds': result.chunkSeconds,
              'timings.transcriptionConcurrency': chunkConcurrency,
            });
          }

          await assertJobActive();
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
            'timings.transcriptionMs': transcriptionMs,
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
    await assertJobActive();
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
      const summaryMs = Date.now() - summaryStartedAt;

      await assertJobActive();

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
        'timings.summaryMs': summaryMs,
        'timings.totalMs': Date.now() - pipelineStartedAt,
        completedAt: new Date(),
      });
      await invalidateCache('dashboard:summary');
      void notifyCallCompletion(callId).catch(() => undefined);

      console.info(`[CALL_PROCESSING_COMPLETE] callId=${callId} durationMs=${Date.now() - pipelineStartedAt}`);
      console.info(`[CALL_PERFORMANCE] callId=${callId} totalMs=${Date.now() - pipelineStartedAt} queueWaitMs=${existingJob.createdAt ? Math.max(0, Date.now() - new Date(existingJob.createdAt).getTime()) : 0}`);

      // Stage 3: AI Mentee Profile Extraction (fail-safe; will not crash or fail the call job)
      try {
        console.info(`[CALL_PROFILE_EXTRACTION_START] callId=${callId}`);
        const extractionResult = await extractProfileFromCall(
          callId,
          transcriptText || refreshedCall?.transcript,
          summaryResult,
          call.menteeId,
        );
        console.info(`[CALL_PROFILE_EXTRACTION_COMPLETE] callId=${callId} extracted=${extractionResult.extractedCount}`);
      } catch (profileErr) {
        console.warn(`[CALL_PROFILE_EXTRACTION_WARN] callId=${callId} non-fatal extraction error:`, profileErr);
      }
    } catch (summaryErr) {
      currentStage = 'summary';
      throw summaryErr;
    }
  } catch (fatalErr) {
    if (fatalErr instanceof JobFencedError) {
      console.warn(`[CALL_PROCESSING_SKIPPED] callId=${callId} jobId=${jobId} reason=job_fenced_during_processing`);
      return;
    }
    const errMsg = fatalErr instanceof Error ? fatalErr.message : String(fatalErr);
    const errorClassification = classifyProcessingError(fatalErr, currentStage);
    const willRetry = errorClassification.retryable && attemptsMade + 1 < attempts;
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
      errorCode: errorClassification.code,
      ...(willRetry ? {} : { completedAt: new Date() }),
    });

    if (!willRetry) {
      void notifyCallFailure(callId, finalError).catch(() => undefined);
    }

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
  const configuredConcurrency = Number(process.env.WORKER_CONCURRENCY || 1);
  const concurrency = Number.isFinite(configuredConcurrency) && configuredConcurrency > 0
    ? Math.floor(configuredConcurrency)
    : 1;

  const worker = new Worker<CallProcessingJobData>(
    QUEUE_NAMES.callProcessing,
    async (job: Job<CallProcessingJobData>) => {
      console.log(`[Worker] Processing job ${job.id} for call ${job.data.callId}`);
      await processCallProcessingJob(job.data, job.attemptsMade, Number(job.opts.attempts || 1));
    },
    {
      connection,
      concurrency,
    },
  );

  worker.on('error', (err: Error) => {
    console.warn('[Worker Service] BullMQ worker warning:', err.message);
  });

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed successfully for callId=${job.data.callId}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[CALL_PROCESSING_FAILED] callId=${job?.data.callId ?? 'unknown'} jobId=${job?.id ?? 'unknown'} error=${err.message}`);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`[Worker] Job ${jobId} stalled (will be retried automatically by BullMQ).`);
  });

  worker.on('error', (err) => {
    console.error('[Worker] BullMQ worker error:', err.message);
  });

  // Log the canonical banner so Render logs confirm the worker is alive
  console.log(`BullMQ call worker is active and listening to queue: call-processing (concurrency=${concurrency})`);

  return worker;
}
