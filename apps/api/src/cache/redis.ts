import { Redis } from 'ioredis';
import { env } from '../config/env.js';

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 100, 3000);
  },
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('[Redis Client Error]:', err.message);
});

// Establish connection lazily/gracefully
redis.connect().catch((err) => {
  console.warn('[Redis] Connection warning:', err.message);
});

/**
 * Verifies connectivity to the Redis instance.
 */
export async function checkRedisConnection(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const res = await redis.ping();
    if (res === 'PONG') {
      return { healthy: true, latencyMs: Date.now() - start };
    }
    return { healthy: false, latencyMs: Date.now() - start, error: `Unexpected ping reply: ${res}` };
  } catch (err) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Heartbeat lease TTL in seconds (matches 35s lease in ARCHITECTURE.md)
const HEARTBEAT_TTL_SECONDS = 35;

/**
 * Stores the worker's latest heartbeat timestamp in Redis with a 35-second TTL.
 */
export async function recordWorkerHeartbeatInCache(workerId: string, timestamp: string): Promise<void> {
  const key = `worker:last_seen:${workerId}`;
  await redis.set(key, timestamp, 'EX', HEARTBEAT_TTL_SECONDS);
}

/**
 * Retrieves the last heartbeat timestamp for a worker from Redis.
 */
export async function getWorkerLastSeenFromCache(workerId: string): Promise<string | null> {
  const key = `worker:last_seen:${workerId}`;
  return redis.get(key);
}

/**
 * Explicitly removes a worker lease from Redis (e.g. during graceful shutdown or drain).
 */
export async function removeWorkerFromCache(workerId: string): Promise<void> {
  const key = `worker:last_seen:${workerId}`;
  await redis.del(key);
}

/**
 * Lists all worker IDs that currently hold an active, non-expired heartbeat lease in Redis.
 */
export async function getActiveWorkerIdsFromCache(): Promise<string[]> {
  const keys = await redis.keys('worker:last_seen:*');
  return keys.map((k) => k.replace('worker:last_seen:', ''));
}
