import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export interface CallProcessingJobData {
  callId: string;
  jobId: string;
  mentorNotes?: string;
  skipTranscription?: boolean;
}

export const QUEUE_NAMES = {
  callProcessing: 'call-processing',
  transcription: 'call-transcription',
  summary: 'call-summary',
  imports: 'bulk-import',
} as const;

export function getRedisUrl(): string {
  return process.env.REDIS_URL || 'redis://127.0.0.1:6379';
}

export function createRedisConnection(): Redis {
  const client = new Redis(getRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times: number) {
      if (times > 5 && process.env.NODE_ENV !== 'production') {
        return null; // Stop retrying in local test/dev if Redis is not running
      }
      return Math.min(times * 500, 3000);
    },
    lazyConnect: true,
  });

  client.on('error', (err: Error) => {
    // Prevent unhandled error crashing when Redis is not available
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[Redis] Connection warning:', err.message);
    }
  });

  return client;
}

let redisConnection: Redis | null = null;
let callProcessingQueue: Queue<CallProcessingJobData> | null = null;

export function getSharedRedisConnection(): Redis {
  if (!redisConnection) redisConnection = createRedisConnection();
  return redisConnection;
}

export function getQueueOptions() {
  return {
    connection: getSharedRedisConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential' as const, delay: 3000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    },
  };
}

export function getCallProcessingQueue(): Queue<CallProcessingJobData> | null {
  if (process.env.DISABLE_REDIS === 'true') {
    return null;
  }

  if (!callProcessingQueue) {
    try {
      callProcessingQueue = new Queue<CallProcessingJobData>(QUEUE_NAMES.callProcessing, getQueueOptions());
      callProcessingQueue.on('error', (err: Error) => {
        console.warn('[Queue] BullMQ queue warning:', err.message);
      });
    } catch (err) {
      console.warn('[Queue] Failed to initialize BullMQ queue:', err instanceof Error ? err.message : err);
      callProcessingQueue = null;
    }
  }

  return callProcessingQueue;
}

/**
 * Enqueues a call processing job to BullMQ.
 * If Redis is not available, executes inline via callback if provided or logs warning.
 */
export async function addCallProcessingJob(
  data: CallProcessingJobData,
  fallbackExecutor?: (data: CallProcessingJobData) => Promise<void>,
): Promise<{ enqueued: boolean; jobId?: string }> {
  const queue = getCallProcessingQueue();

  if (queue) {
    try {
      const bullJob = await queue.add(`process-${data.callId}`, data, {
        jobId: `call-${data.callId}-${Date.now()}`,
      });
      return { enqueued: true, jobId: bullJob.id };
    } catch (queueErr) {
      console.warn('[Queue] BullMQ enqueue failed, checking fallback:', queueErr instanceof Error ? queueErr.message : queueErr);
      if (fallbackExecutor) {
        // Run asynchronously via fallback executor
        fallbackExecutor(data).catch((err) => {
          console.error('[Queue] Fallback executor error:', err);
        });
        return { enqueued: true, jobId: `fallback-${Date.now()}` };
      }
      throw queueErr;
    }
  }

  if (fallbackExecutor) {
    fallbackExecutor(data).catch((err) => {
      console.error('[Queue] Fallback executor error:', err);
    });
    return { enqueued: true, jobId: `fallback-${Date.now()}` };
  }

  throw new Error('Redis queue is unavailable and no fallback executor was provided.');
}

/**
 * Checks Redis connectivity for health/readiness endpoints.
 */
export async function checkRedisHealth(): Promise<boolean> {
  if (process.env.DISABLE_REDIS === 'true') {
    return true;
  }
  try {
    const client = getSharedRedisConnection();
    const pong = await Promise.race([
      client.ping(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)),
    ]);
    return pong === 'PONG';
  } catch {
    return false;
  }
}

