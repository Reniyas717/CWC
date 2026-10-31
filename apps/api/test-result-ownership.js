/**
 * Public-interface checks for deployment attempt ownership.
 *
 * Start the API and PostgreSQL first, then run:
 *   node apps/api/test-result-ownership.js
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
      name: `Attempt test ${id}`,
      hostname: id,
      ipAddress: '100.100.0.21',
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

async function createDeployment(workerId, name) {
  const response = await fetch(`${base}/api/v1/deployments`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${runId}`,
      framework: 'dockerfile',
      git: { repositoryUrl: 'https://github.com/cloud-without-clouds/demo-app.git', branch: 'main' },
      port: 8080,
      workerId,
      resourceLimits: { cpuLimitCores: 1, memoryLimitMb: 512 },
    }),
  });
  const payload = await response.json();
  assert(response.status === 201 && payload.success === true, `created deployment ${name}`);
  created.deploymentIds.push(payload.data.id);
  created.applicationIds.push(payload.data.applicationId);
  return payload.data.id;
}

async function poll(workerId) {
  const response = await fetch(`${base}/api/v1/workers/${workerId}/tasks`, { headers: workerHeaders });
  const payload = await response.json();
  assert(response.ok && payload.hasTask === true, `worker ${workerId} claimed a task`);
  return payload.task;
}

async function report(task, state = 'running', attemptId = task.attemptId, workerId = task.workerId) {
  return fetch(`${base}/api/v1/internal/deployments/${task.deploymentId}/result`, {
    method: 'POST',
    headers: workerHeaders,
    body: JSON.stringify({
      deploymentId: task.deploymentId,
      workerId: workerId || task.workerId,
      attemptId,
      state,
      assignedPort: 39000,
      containerId: `cwc-test-${task.deploymentId}`,
    }),
  });
}

async function cancel(deploymentId) {
  return fetch(`${base}/api/v1/deployments/${deploymentId}/cancel`, {
    method: 'POST',
    headers: adminHeaders,
  });
}

async function main() {
  const workerId = `attempt-worker-${runId}`;
  await registerWorker(workerId);

  const duplicateId = await createDeployment(workerId, 'Duplicate result');
  const task = await poll(workerId);
  assert(typeof task.attemptId === 'string', 'claimed task carries an attempt identity');

  const first = await report({ ...task, workerId });
  assert(first.status === 200, 'first result is accepted');
  const duplicate = await report({ ...task, workerId });
  const duplicatePayload = await duplicate.json();
  assert(duplicate.status === 200 && duplicatePayload.duplicate === true, 'duplicate result is idempotently acknowledged');
  const count = await pool.query(
    "SELECT count(*)::int AS count FROM deployment_events WHERE deployment_id = $1 AND event_type = 'CONTAINER_START'",
    [duplicateId]
  );
  assert(count.rows[0].count === 1, 'duplicate result does not create another start event');

  const staleId = await createDeployment(workerId, 'Stale result');
  const staleTask = await poll(workerId);
  const stale = await report({ ...staleTask, workerId }, 'running', `obsolete-${staleTask.attemptId}`);
  const stalePayload = await stale.json();
  assert(stale.status === 409 && stalePayload.stale === true, 'outdated attempt is rejected');

  const cancelledId = await createDeployment(workerId, 'Cancelled result');
  const cancelledTask = await poll(workerId);
  const cancelled = await cancel(cancelledId);
  assert(cancelled.status === 200, 'deployment cancellation succeeds');
  const afterCancel = await report({ ...cancelledTask, workerId });
  const afterCancelPayload = await afterCancel.json();
  assert(afterCancel.status === 409 && afterCancelPayload.stale === true, 'result after cancellation cannot revive deployment');
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
