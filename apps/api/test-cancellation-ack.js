/**
 * Cancellation acknowledgement and queue progression checks.
 *
 * Start the API, PostgreSQL, migrations, and then run:
 *   node apps/api/test-cancellation-ack.js
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
const testWorkerId = `cancel-worker-${runId}`;
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
      name: `Cancellation test ${id}`,
      hostname: id,
      ipAddress: '100.100.0.22',
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
  const response = await fetch(`${base}/api/v1/workers/${workerId}/tasks`, {
    headers: workerHeaders,
  });
  assert(response.ok, `worker ${workerId} task poll succeeded`);
  return response.json();
}

async function cancel(deploymentId) {
  return fetch(`${base}/api/v1/deployments/${deploymentId}/cancel`, {
    method: 'POST',
    headers: adminHeaders,
  });
}

async function acknowledgeCancellation(task, workerId) {
  return fetch(`${base}/api/v1/internal/deployments/${task.deploymentId}/result`, {
    method: 'POST',
    headers: workerHeaders,
    body: JSON.stringify({
      deploymentId: task.deploymentId,
      workerId,
      attemptId: task.attemptId,
      state: 'stopped',
      errorMessage: 'test cancellation cleanup acknowledgement',
    }),
  });
}

async function main() {
  const workerId = testWorkerId;
  await registerWorker(workerId);

  const cancelledId = await createDeployment(workerId, 'Cancellation lease');
  const cancelledTask = await poll(workerId);
  assert(cancelledTask.hasTask === true, 'worker claimed the deployment before cancellation');
  assert(cancelledTask.task.deploymentId === cancelledId, 'claimed task matches the deployment being cancelled');

  const cancelled = await cancel(cancelledId);
  assert(cancelled.status === 200, 'deployment cancellation succeeds');

  const cancellationDirective = await poll(workerId);
  assert(cancellationDirective.action === 'cancel', 'worker receives a cancellation directive');
  assert(cancellationDirective.deploymentId === cancelledId, 'directive identifies the cancelled deployment');

  const dispatched = await pool.query(
    'SELECT cancel_dispatched_at FROM deployments WHERE id = $1',
    [cancelledId]
  );
  assert(dispatched.rows[0]?.cancel_dispatched_at !== null, 'cancellation directive receives a dispatch lease');

  const queuedId = await createDeployment(workerId, 'Queued after cancellation');
  const acknowledgement = await acknowledgeCancellation(cancellationDirective, workerId);
  const acknowledgementPayload = await acknowledgement.json();
  assert(
    acknowledgement.status === 200 && acknowledgementPayload.cancellationAcknowledged === true,
    'worker cancellation acknowledgement is accepted idempotently'
  );

  const cancellationState = await pool.query(
    'SELECT state, cancel_acknowledged_at FROM deployments WHERE id = $1',
    [cancelledId]
  );
  assert(cancellationState.rows[0]?.state === 'cancelled', 'acknowledgement preserves cancelled state');
  assert(cancellationState.rows[0]?.cancel_acknowledged_at !== null, 'acknowledgement timestamp is persisted');

  const event = await pool.query(
    "SELECT count(*)::int AS count FROM deployment_events WHERE deployment_id = $1 AND event_type = 'CANCEL_ACKNOWLEDGED'",
    [cancelledId]
  );
  assert(event.rows[0]?.count === 1, 'cancellation acknowledgement records one event');

  const nextPoll = await poll(workerId);
  assert(nextPoll.hasTask === true, 'worker receives a queued deployment after cancellation acknowledgement');
  assert(nextPoll.task.deploymentId === queuedId, 'queued deployment is not starved by an acknowledged cancellation');

  const duplicate = await acknowledgeCancellation(cancellationDirective, workerId);
  const duplicatePayload = await duplicate.json();
  assert(
    duplicate.status === 200 && duplicatePayload.cancellationAcknowledged === true,
    'duplicate cancellation acknowledgement remains safe'
  );
  const duplicateEvent = await pool.query(
    "SELECT count(*)::int AS count FROM deployment_events WHERE deployment_id = $1 AND event_type = 'CANCEL_ACKNOWLEDGED'",
    [cancelledId]
  );
  assert(duplicateEvent.rows[0]?.count === 1, 'duplicate acknowledgement does not create another event');
}

main()
  .catch((error) => {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      // Discover by worker ID first so cleanup still works when a failure occurs
      // before a response ID can be added to the in-memory tracking arrays.
      const workerDeployments = await pool.query(
        'SELECT DISTINCT application_id FROM deployments WHERE worker_id = $1',
        [testWorkerId]
      );
      const applicationIds = [
        ...new Set([
          ...created.applicationIds,
          ...workerDeployments.rows.map((row) => row.application_id).filter(Boolean),
        ]),
      ];
      await pool.query('DELETE FROM deployments WHERE worker_id = $1', [testWorkerId]);
      if (applicationIds.length > 0) {
        await pool.query(
          'DELETE FROM applications WHERE id = ANY($1::varchar[]) AND NOT EXISTS (SELECT 1 FROM deployments WHERE deployments.application_id = applications.id)',
          [applicationIds]
        );
      }
      await pool.query('DELETE FROM worker_nodes WHERE id = $1', [testWorkerId]);
    } finally {
      await pool.end();
    }
  });
