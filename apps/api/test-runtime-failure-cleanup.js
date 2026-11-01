/**
 * Regression check for a worker reporting that a previously running
 * container disappeared. The API must invalidate the public URL immediately
 * while gateway deletion is handled asynchronously/retried.
 *
 * Start the API, PostgreSQL, migrations, and then run:
 *   node apps/api/test-runtime-failure-cleanup.js
 */
import 'dotenv/config';
import pg from 'pg';

const base = process.env.API_BASE_URL || 'http://localhost:4000';
const adminToken = process.env.ADMIN_TOKEN || 'dev-admin-token-change-in-production';
const workerToken = process.env.WORKER_SECRET_TOKEN || 'dev-worker-secret-token-change-in-production';
const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://cwc_user:cwc_password@localhost:5432/cloud_without_clouds?schema=public';
const adminHeaders = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
const workerHeaders = { Authorization: `Bearer ${workerToken}`, 'Content-Type': 'application/json' };
const pool = new pg.Pool({ connectionString: databaseUrl });
const runId = Date.now();
const workerId = `runtime-failure-worker-${runId}`;
const created = { deploymentIds: [], applicationIds: [] };

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

async function registerWorker() {
  const response = await fetch(`${base}/api/v1/workers/register`, {
    method: 'POST',
    headers: workerHeaders,
    body: JSON.stringify({
      id: workerId,
      name: `Runtime failure test ${workerId}`,
      hostname: workerId,
      ipAddress: '100.100.0.23',
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
      limits: { maxConcurrentWorkloads: 1, maxMemoryMb: 4096, maxCpuCores: 2 },
      version: '0.1.0',
    }),
  });
  assert(response.ok, 'registered runtime-failure test worker');
}

async function createDeployment() {
  const response = await fetch(`${base}/api/v1/deployments`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'Runtime Failure Cleanup',
      slug: `runtime-failure-cleanup-${runId}`,
      framework: 'dockerfile',
      git: { repositoryUrl: 'https://github.com/cloud-without-clouds/demo-app.git', branch: 'main' },
      port: 8080,
      workerId,
      resourceLimits: { cpuLimitCores: 1, memoryLimitMb: 512 },
    }),
  });
  const payload = await response.json();
  assert(response.status === 201 && payload.success === true, 'created runtime-failure deployment');
  created.deploymentIds.push(payload.data.id);
  created.applicationIds.push(payload.data.applicationId);
  return payload.data.id;
}

async function poll() {
  let lastPayload = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(`${base}/api/v1/workers/${workerId}/tasks`, {
      headers: workerHeaders,
    });
    const payload = await response.json();
    lastPayload = payload;
    if (response.ok && payload.hasTask === true) {
      console.log('PASS: worker claimed runtime-failure deployment');
      return payload.task;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`worker could not claim runtime-failure deployment (response: ${JSON.stringify(lastPayload)})`);
}

async function report(task, state) {
  return fetch(`${base}/api/v1/internal/deployments/${task.deploymentId}/result`, {
    method: 'POST',
    headers: workerHeaders,
    body: JSON.stringify({
      deploymentId: task.deploymentId,
      workerId,
      attemptId: task.attemptId,
      state,
      containerId: `cwc-test-${task.deploymentId}`,
      assignedPort: 39001,
      errorMessage: state === 'failed' ? 'Managed container disappeared during reconciliation' : null,
    }),
  });
}

async function main() {
  await registerWorker();
  const deploymentId = await createDeployment();
  const task = await poll();

  const running = await report(task, 'running');
  assert(running.status === 200, 'running result is accepted before simulated disappearance');

  // Simulate a route that was published by the asynchronous gateway path.
  await pool.query(
    "UPDATE deployments SET public_url = 'https://runtime-failure.example.test', routing_status = 'ready' WHERE id = $1",
    [deploymentId]
  );

  const failed = await report(task, 'failed');
  assert(failed.status === 200, 'missing-container failure result is accepted');

  const current = await pool.query(
    'SELECT state, public_url, routing_status FROM deployments WHERE id = $1',
    [deploymentId]
  );
  assert(current.rows[0]?.state === 'failed', 'deployment is marked failed');
  assert(current.rows[0]?.public_url === null, 'stale public URL is invalidated immediately');
  assert(current.rows[0]?.routing_status === 'failed', 'routing status reflects terminal cleanup');
}

main()
  .catch((error) => {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (created.deploymentIds.length > 0) {
        await pool.query('DELETE FROM deployments WHERE id = ANY($1::varchar[])', [created.deploymentIds]);
      }
      if (created.applicationIds.length > 0) {
        await pool.query('DELETE FROM applications WHERE id = ANY($1::varchar[])', [created.applicationIds]);
      }
      await pool.query('DELETE FROM worker_nodes WHERE id = $1', [workerId]);
    } finally {
      await pool.end();
    }
  });
