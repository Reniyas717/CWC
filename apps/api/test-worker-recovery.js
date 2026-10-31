/**
 * Worker-loss recovery checks through the public control-plane seams.
 *
 * Start the API, PostgreSQL and migrations first, then run:
 *   node apps/api/test-worker-recovery.js
 */
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
const created = { workerIds: [], deploymentIds: [], applicationIds: [] };

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

async function registerWorker(id) {
  const response = await fetch(`${base}/api/v1/workers/register`, {
    method: 'POST',
    headers: workerHeaders,
    body: JSON.stringify({
      id,
      name: `Recovery test ${id}`,
      hostname: id,
      ipAddress: '100.100.0.20',
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
      limits: { maxConcurrentWorkloads: 4, maxMemoryMb: 4096, maxCpuCores: 2 },
      version: '0.1.0',
    }),
  });
  assert(response.ok, `registered worker ${id}`);
  created.workerIds.push(id);
}

async function createDeployment(workerId) {
  const response = await fetch(`${base}/api/v1/deployments`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'Worker recovery',
      slug: `worker-recovery-${runId}`,
      framework: 'dockerfile',
      git: { repositoryUrl: 'https://github.com/cloud-without-clouds/demo-app.git', branch: 'main' },
      port: 8080,
      workerId,
    }),
  });
  const payload = await response.json();
  assert(response.status === 201 && payload.success === true, 'created recovery deployment');
  created.deploymentIds.push(payload.data.id);
  created.applicationIds.push(payload.data.applicationId);
  return payload.data.id;
}

async function poll(workerId) {
  const response = await fetch(`${base}/api/v1/workers/${workerId}/tasks`, {
    headers: workerHeaders,
  });
  const payload = await response.json();
  assert(response.ok, `worker ${workerId} task poll succeeded`);
  return payload;
}

async function report(deploymentId, workerId, attemptId, state = 'running') {
  return fetch(`${base}/api/v1/internal/deployments/${deploymentId}/result`, {
    method: 'POST',
    headers: workerHeaders,
    body: JSON.stringify({
      deploymentId,
      workerId,
      attemptId,
      state,
      assignedPort: 39000,
      containerId: `cwc-test-${deploymentId}`,
    }),
  });
}

async function sweep() {
  const response = await fetch(`${base}/api/v1/workers/sweep`, {
    method: 'POST',
    headers: adminHeaders,
  });
  const payload = await response.json();
  assert(response.ok && payload.success === true, 'worker sweep succeeded');
  return payload.data;
}

async function main() {
  const deadWorkerId = `recovery-dead-${runId}`;
  const rescueWorkerId = `recovery-rescue-${runId}`;
  await registerWorker(deadWorkerId);
  await registerWorker(rescueWorkerId);

  const deploymentId = await createDeployment(deadWorkerId);
  const firstPoll = await poll(deadWorkerId);
  assert(firstPoll.hasTask === true, 'dead worker claimed the deployment before disconnect');
  const firstAttemptId = firstPoll.task.attemptId;

  await pool.query('UPDATE worker_nodes SET last_heartbeat_at = $1 WHERE id = $2', [
    new Date(Date.now() - 60_000),
    deadWorkerId,
  ]);

  const firstSweep = await sweep();
  assert(firstSweep.offlineWorkers.includes(deadWorkerId), 'heartbeat loss marks the worker offline');
  assert(firstSweep.rescheduledDeployments.includes(deploymentId), 'in-flight deployment is requeued');
  assert(firstSweep.scheduledDeployments.includes(deploymentId), 'recovery schedules the replacement automatically');

  const secondSweep = await sweep();
  assert(!secondSweep.rescheduledDeployments.includes(deploymentId), 'repeated sweep does not duplicate recovery');

  const replacementPoll = await poll(rescueWorkerId);
  assert(replacementPoll.hasTask === true, 'eligible rescue worker receives the replacement task');
  assert(replacementPoll.task.deploymentId === deploymentId, 'replacement task has the same deployment ID');
  assert(replacementPoll.task.attemptId !== firstAttemptId, 'replacement receives a new attempt identity');

  const stale = await report(deploymentId, deadWorkerId, firstAttemptId, 'running');
  const stalePayload = await stale.json();
  assert(stale.status === 409 && stalePayload.stale === true, 'old worker result is rejected as stale');

  const current = await pool.query(
    'SELECT state, worker_id, attempt_id, retry_count FROM deployments WHERE id = $1',
    [deploymentId]
  );
  assert(current.rows[0]?.state === 'building', 'deployment remains owned by the replacement while it builds');
  assert(current.rows[0]?.worker_id === rescueWorkerId, 'replacement worker owns the deployment');
  assert(current.rows[0]?.retry_count === 1, 'worker-loss recovery increments retry count once');
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
      if (created.workerIds.length > 0) {
        await pool.query('DELETE FROM worker_nodes WHERE id = ANY($1::varchar[])', [created.workerIds]);
      }
    } finally {
      await pool.end();
    }
  });
