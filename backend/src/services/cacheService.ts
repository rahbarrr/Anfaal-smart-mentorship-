import { getSharedRedisConnection } from '../queue/callQueue.js';

const PREFIX = 'anfaal:cache:';

export async function getCachedJson<T>(key: string): Promise<T | null> {
  if (process.env.DISABLE_REDIS === 'true') return null;
  try {
    const value = await getSharedRedisConnection().get(`${PREFIX}${key}`);
    return value ? (JSON.parse(value) as T) : null;
  } catch (error) {
    console.warn('[Cache] Read skipped:', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function setCachedJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (process.env.DISABLE_REDIS === 'true') return;
  try {
    await getSharedRedisConnection().set(`${PREFIX}${key}`, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (error) {
    console.warn('[Cache] Write skipped:', error instanceof Error ? error.message : error);
  }
}

export async function invalidateCache(key: string): Promise<void> {
  if (process.env.DISABLE_REDIS === 'true') return;
  try { await getSharedRedisConnection().del(`${PREFIX}${key}`); } catch (error) {
    console.warn('[Cache] Invalidation skipped:', error instanceof Error ? error.message : error);
  }
}
