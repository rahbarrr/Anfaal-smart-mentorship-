import { addCallProcessingJob, CallProcessingJobData } from '../queue/callQueue.js';
import { processCallProcessingJob } from '../queue/callWorker.js';

/**
 * Enqueues a call processing job to the BullMQ Redis queue.
 * Returns quickly to the Express HTTP handler.
 */
export async function enqueueCallProcessingJob(data: CallProcessingJobData): Promise<{ enqueued: boolean; jobId?: string }> {
  const isProduction = process.env.NODE_ENV === 'production';

  // In production, the API service must NOT execute long-running transcription or AI summarization directly.
  // It strictly enqueues to the Redis BullMQ queue for the dedicated Render Background Worker.
  if (isProduction && process.env.ALLOW_INLINE_PROCESSING !== 'true') {
    const result = await addCallProcessingJob(data);
    console.info(`[CALL_JOB_CREATED] callId=${data.callId} jobId=${result.jobId ?? data.jobId}`);
    return result;
  }

  const result = await addCallProcessingJob(data, async (jobData) => {
    // Fallback executor strictly for local development/test when Redis is not running
    console.info(`[CALL_PROCESSING_START] callId=${jobData.callId} mode=local-fallback`);
    await processCallProcessingJob(jobData);
  });
  console.info(`[CALL_JOB_CREATED] callId=${data.callId} jobId=${result.jobId ?? data.jobId}`);
  return result;
}

/**
 * Legacy pipeline wrapper maintained for backward compatibility.
 */
export async function runCallProcessingPipeline(
  jobId: string,
  callId: string,
  _fileBuffer?: Buffer,
  _originalname?: string,
  _mimetype?: string,
  mentorNotes?: string,
): Promise<void> {
  await enqueueCallProcessingJob({
    callId,
    jobId,
    mentorNotes,
  });
}
