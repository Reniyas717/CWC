import { Redis } from 'ioredis';
import { env } from '../config/env.js';

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 1,
  connectTimeout: 1000,
  retryStrategy(times) {
    if (times > 3) return null; // stop reconnect spamming if Redis is offline
    return Math.min(times * 200, 2000);
  },
  lazyConnect: true,
});

let _redisConnected = false;

redis.on('connect', () => {
  _redisConnected = true;
});

redis.on('error', (err) => {
  _redisConnected = false;
  if (env.NODE_ENV !== 'development') {
    console.error('[Redis Client Error]:', err.message);
  }
});

// Attempt lazy connection once
redis.connect().catch(() => {
  _redisConnected = false;
});

// In-Memory cache fallback when Redis is offline
const inMemoryCache = new Map<string, { value: string; expiresAt: number }>();

/**
 * Verifies connectivity to the Redis instance.
 */
export async function checkRedisConnection(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  if (!_redisConnected && redis.status !== 'ready') {
    return {
      healthy: false,
      latencyMs: 0,
      error: 'Redis offline (using in-memory fallback)',
    };
  }

  const start = Date.now();
  try {
    const res = await redis.ping();
    if (res === 'PONG') {
      _redisConnected = true;
      return { healthy: true, latencyMs: Date.now() - start };
    }
    return { healthy: false, latencyMs: Date.now() - start, error: `Unexpected ping reply: ${res}` };
  } catch (err) {
    _redisConnected = false;
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
 * Stores the worker's latest heartbeat timestamp with a 35-second TTL.
 */
export async function recordWorkerHeartbeatInCache(workerId: string, timestamp: string): Promise<void> {
  const key = `worker:last_seen:${workerId}`;
  if (_redisConnected) {
    try {
      await redis.set(key, timestamp, 'EX', HEARTBEAT_TTL_SECONDS);
      return;
    } catch {
      _redisConnected = false;
    }
  }
  inMemoryCache.set(key, {
    value: timestamp,
    expiresAt: Date.now() + HEARTBEAT_TTL_SECONDS * 1000,
  });
}

/**
 * Retrieves the last heartbeat timestamp for a worker.
 */
export async function getWorkerLastSeenFromCache(workerId: string): Promise<string | null> {
  const key = `worker:last_seen:${workerId}`;
  if (_redisConnected) {
    try {
      return await redis.get(key);
    } catch {
      _redisConnected = false;
    }
  }
  const entry = inMemoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    inMemoryCache.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * Explicitly removes a worker lease.
 */
export async function removeWorkerFromCache(workerId: string): Promise<void> {
  const key = `worker:last_seen:${workerId}`;
  if (_redisConnected) {
    try {
      await redis.del(key);
      return;
    } catch {
      _redisConnected = false;
    }
  }
  inMemoryCache.delete(key);
}

/**
 * Lists all worker IDs that currently hold an active, non-expired heartbeat lease.
 */
export async function getActiveWorkerIdsFromCache(): Promise<string[]> {
  if (_redisConnected) {
    try {
      const keys = await redis.keys('worker:last_seen:*');
      return keys.map((k) => k.replace('worker:last_seen:', ''));
    } catch {
      _redisConnected = false;
    }
  }
  const now = Date.now();
  const activeIds: string[] = [];
  for (const [key, entry] of inMemoryCache.entries()) {
    if (now <= entry.expiresAt && key.startsWith('worker:last_seen:')) {
      activeIds.push(key.replace('worker:last_seen:', ''));
    }
  }
  return activeIds;
}
