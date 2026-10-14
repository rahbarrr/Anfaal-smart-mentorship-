import { getSharedRedisConnection, withTimeout } from '../queue/callQueue.js';

const PREFIX = 'anfaal:cache:';
const CACHE_TIMEOUT_MS = 100;

function isRedisReady(): boolean {
  if (process.env.DISABLE_REDIS === 'true') return false;
  try {
    const client = getSharedRedisConnection();
    return client && client.status === 'ready';
  } catch {
    return false;
  }
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  if (!isRedisReady()) return null;
  try {
    const client = getSharedRedisConnection();
    const value = await withTimeout(
      client.get(`${PREFIX}${key}`),
      CACHE_TIMEOUT_MS,
      'Redis get timed out',
    );
    return value ? (JSON.parse(value) as T) : null;
  } catch (error) {
    console.warn('[Cache] Read skipped:', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function setCachedJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!isRedisReady()) return;
  try {
    const client = getSharedRedisConnection();
    await withTimeout(
      client.set(`${PREFIX}${key}`, JSON.stringify(value), 'EX', ttlSeconds),
      CACHE_TIMEOUT_MS,
      'Redis set timed out',
    );
  } catch (error) {
    console.warn('[Cache] Write skipped:', error instanceof Error ? error.message : error);
  }
}

export async function invalidateCache(key: string): Promise<void> {
  if (!isRedisReady()) return;
  try {
    const client = getSharedRedisConnection();
    await withTimeout(
      client.del(`${PREFIX}${key}`),
      CACHE_TIMEOUT_MS,
      'Redis del timed out',
    );
  } catch (error) {
    console.warn('[Cache] Invalidation skipped:', error instanceof Error ? error.message : error);
  }
}
