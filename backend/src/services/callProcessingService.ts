import { addCallProcessingJob, CallProcessingJobData } from '../queue/callQueue.js';
import { processCallProcessingJob } from '../queue/callWorker.js';

/**
 * Enqueues a call processing job to the BullMQ Redis queue.
 * Returns quickly to the Express HTTP handler.
 */
export async function enqueueCallProcessingJob(data: CallProcessingJobData): Promise<{ enqueued: boolean; jobId?: string }> {
  return addCallProcessingJob(data, async (jobData) => {
    // Fallback executor for dev/test when Redis is not running
    console.log('[CallProcessing] Running job via fallback in-process handler for call:', jobData.callId);
    await processCallProcessingJob(jobData);
  });
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
