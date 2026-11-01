/**
 * Regression check for two machines registering under the same worker ID.
 *
 * Start the API, PostgreSQL, migrations, then run:
 *   node apps/api/test-worker-id-conflict.js
 */
import 'dotenv/config';
import pg from 'pg';

const base = process.env.API_BASE_URL || 'http://localhost:4000';
const workerToken = process.env.WORKER_SECRET_TOKEN || 'dev-worker-secret-token-change-in-production';
const headers = { Authorization: `Bearer ${workerToken}`, 'Content-Type': 'application/json' };
const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://cwc_user:cwc_password@localhost:5432/cloud_without_clouds?schema=public';
const pool = new pg.Pool({ connectionString: databaseUrl });
const workerId = `identity-conflict-${Date.now()}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

async function waitForDatabase() {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const response = await fetch(`${base}/health`);
      const health = await response.json();
      if (response.ok && health.dependencies?.database?.status === 'ok') return;
    } catch {
      // API may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('API database did not become ready');
}

async function register({ hostname, ipAddress }) {
  return fetch(`${base}/api/v1/workers/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: workerId,
      name: `Identity conflict test ${hostname}`,
      hostname,
      ipAddress,
      port: 5001,
      authToken: workerToken,
      resources: {
        cpuCount: 4,
        cpuUsagePercent: 5,
        totalMemoryMb: 8192,
        freeMemoryMb: 4096,
        usedMemoryMb: 4096,
        activeContainers: 0,
      },
      limits: { maxConcurrentWorkloads: 2, maxMemoryMb: 4096, maxCpuCores: 2 },
      version: '0.1.0',
    }),
  });
}

async function main() {
  await waitForDatabase();
  const first = await register({ hostname: `worker-a-${workerId}`, ipAddress: '100.100.0.31' });
  assert(first.status === 200, 'first machine registers successfully');

  const duplicate = await register({ hostname: `worker-b-${workerId}`, ipAddress: '100.100.0.32' });
  const body = await duplicate.json();
  assert(
    duplicate.status === 409 && body.error?.code === 'WORKER_ID_CONFLICT',
    `a different machine cannot overwrite the active worker ID (received HTTP ${duplicate.status})`
  );
}

main()
  .catch((error) => {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.query('DELETE FROM worker_nodes WHERE id = $1', [workerId]);
    } catch {
      // Cleanup is best-effort if the database becomes unavailable.
    } finally {
      await pool.end();
    }
  });
