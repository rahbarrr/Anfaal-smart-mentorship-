import { Call } from '../models/Call.js';
import { CallProcessingJob } from '../models/CallProcessingJob.js';
import { addCallProcessingJob, removeCallProcessingJob } from '../queue/callQueue.js';

export interface JobRecoverySummary {
  scanned: number;
  recovered: number;
  completed: number;
  failed: number;
}

export function getJobStaleTimeoutMs(status: 'PROCESSING' | 'PENDING' = 'PROCESSING'): number {
  const configured = Number(process.env.CALL_JOB_STALE_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 60_000) return configured;

  const statusSpecific = Number(
    status === 'PENDING'
      ? (process.env.CALL_JOB_PENDING_STALE_TIMEOUT_MS || 5 * 60 * 1000)
      : (process.env.CALL_JOB_PROCESSING_STALE_TIMEOUT_MS || 30 * 60 * 1000),
  );
  return Number.isFinite(statusSpecific) && statusSpecific >= 60_000
    ? statusSpecific
    : status === 'PENDING' ? 5 * 60 * 1000 : 30 * 60 * 1000;
}

export function isActiveJobFresh(job: { status: string; heartbeatAt?: Date; updatedAt?: Date; startedAt?: Date; createdAt?: Date }): boolean {
  if (!['PROCESSING', 'PENDING'].includes(job.status)) return false;
  const lastActivity = job.heartbeatAt || job.updatedAt || job.startedAt || job.createdAt;
  const status = job.status as 'PROCESSING' | 'PENDING';
  return Boolean(lastActivity && Date.now() - new Date(lastActivity).getTime() < getJobStaleTimeoutMs(status));
}

export function isJobRunnable(status: string): boolean {
  return status === 'PENDING' || status === 'PROCESSING';
}

/**
 * Reconciles database jobs left in PROCESSING or PENDING after a worker restart or crash.
 * The state transition is claimed atomically so two worker instances cannot
 * recover the same job concurrently.
 */
export async function recoverStaleCallJobs(limit = 25): Promise<JobRecoverySummary> {
  const processingCutoff = new Date(Date.now() - getJobStaleTimeoutMs('PROCESSING'));
  const pendingCutoff = new Date(Date.now() - getJobStaleTimeoutMs('PENDING'));
  const candidates = await CallProcessingJob.find({
    status: { $in: ['PROCESSING', 'PENDING'] },
    $or: [
      { status: 'PROCESSING', heartbeatAt: { $lt: processingCutoff } },
      { status: 'PROCESSING', heartbeatAt: { $exists: false }, updatedAt: { $lt: processingCutoff } },
      { status: 'PENDING', heartbeatAt: { $lt: pendingCutoff } },
      { status: 'PENDING', heartbeatAt: { $exists: false }, updatedAt: { $lt: pendingCutoff } },
    ],
  })
    .sort({ updatedAt: 1 })
    .limit(limit)
    .lean();

  const summary: JobRecoverySummary = { scanned: candidates.length, recovered: 0, completed: 0, failed: 0 };

  for (const candidate of candidates) {
    const claimed = await CallProcessingJob.findOneAndUpdate(
      { _id: candidate._id, status: candidate.status },
      {
        $set: {
          status: 'FAILED',
          error: 'Worker heartbeat expired. The processing job was recovered automatically.',
          completedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!claimed) continue;

    // Remove queued work when possible. If the job is already active, the
    // worker-side database fence prevents it from mutating the call.
    await removeCallProcessingJob(String(candidate._id));

    const call = await Call.findById(candidate.callId);
    if (!call) {
      summary.failed += 1;
      continue;
    }

    const alreadyCompleted = call.processingStatus === 'completed'
      || Boolean(call.transcription?.status === 'COMPLETED' && call.aiSummary?.status === 'COMPLETED');
    if (alreadyCompleted) {
      await CallProcessingJob.findByIdAndUpdate(candidate._id, {
        $set: { status: 'COMPLETED', stage: 'COMPLETE', progress: 100, error: '', completedAt: new Date() },
      });
      summary.completed += 1;
      continue;
    }

    const skipTranscription = Boolean(call.transcription?.status === 'COMPLETED' && (call.transcription.text || call.transcript));
    const retryJob = await CallProcessingJob.create({
      callId: String(call._id),
      stage: skipTranscription ? 'SUMMARY' : 'TRANSCRIPTION',
      status: 'PENDING',
      progress: skipTranscription ? 50 : 0,
      stageStatus: {
        upload: 'COMPLETED',
        audioProcessing: skipTranscription ? 'COMPLETED' : 'PENDING',
        transcription: skipTranscription ? 'COMPLETED' : 'PENDING',
        summary: 'PENDING',
        mentorReview: 'PENDING',
      },
    });

    try {
      await Call.findByIdAndUpdate(call._id, {
        $set: {
          processingStatus: 'queued',
          aiStatus: 'pending',
          ...(skipTranscription ? {} : { 'transcription.status': 'PENDING' }),
          'aiSummary.status': 'PENDING',
        },
      });
      await addCallProcessingJob({
        callId: String(call._id),
        jobId: String(retryJob._id),
        mentorId: call.mentorId,
        menteeId: call.menteeId,
        storageKey: call.recording?.storageKey,
        mentorNotes: call.mentorNotes,
        skipTranscription,
      });
      summary.recovered += 1;
      console.warn(`[JOB_RECOVERED] callId=${call._id} oldJobId=${candidate._id} newJobId=${retryJob._id}`);
    } catch (error) {
      await CallProcessingJob.findByIdAndUpdate(retryJob._id, {
        $set: { status: 'FAILED', error: 'Recovered job could not be requeued.', completedAt: new Date() },
      });
      summary.failed += 1;
      console.error(`[JOB_RECOVERY_FAILED] callId=${call._id} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return summary;
}
