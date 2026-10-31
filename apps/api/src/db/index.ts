import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { env } from '../config/env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 1500,
});

let _isDbOnline = false;

pool.on('error', (err) => {
  _isDbOnline = false;
  if (env.NODE_ENV !== 'development') {
    console.error('[Database Pool Error]:', err.message);
  }
});

export const db = drizzle(pool, { schema });

/**
 * Returns whether PostgreSQL is currently reachable.
 */
export function isDatabaseAvailable(): boolean {
  return _isDbOnline;
}

/**
 * Verifies connectivity to the PostgreSQL instance.
 */
export async function checkDatabaseConnection(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      _isDbOnline = true;
      return { healthy: true, latencyMs: Date.now() - start };
    } finally {
      client.release();
    }
  } catch (error) {
    _isDbOnline = false;
    const message = error instanceof Error ? error.message : String(error);
    return { healthy: false, latencyMs: Date.now() - start, error: message };
  }
}

// Fast non-blocking check
checkDatabaseConnection().catch(() => {
  _isDbOnline = false;
});

// Periodic background check every 30 seconds
setInterval(() => {
  checkDatabaseConnection().catch(() => {
    _isDbOnline = false;
  });
}, 30000).unref();

export { schema };
