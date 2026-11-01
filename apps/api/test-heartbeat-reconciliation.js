/**
 * Regression check for worker restart reconciliation.
 *
 * Start the API, PostgreSQL, migrations, and then run:
 *   node apps/api/test-heartbeat-reconciliation.js
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
const workerId = `heartbeat-reconcile-worker-${runId}`;
const created = { deploymentIds: [], applicationIds: [] };

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

async function waitForDatabase() {
  for (let attempt = 1; attempt <= 10; attempt++) {
    const response = await fetch(`${base}/health`);
    const payload = await response.json();
    if (response.ok && payload.dependencies?.database?.status === 'ok') {
      console.log('PASS: control plane database is ready');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('control plane database is not ready; refusing to run a partial in-memory fixture');
}

async function registerWorker() {
  const response = await fetch(`${base}/api/v1/workers/register`, {
    method: 'POST',
    headers: workerHeaders,
    body: JSON.stringify({
      id: workerId,
      name: `Heartbeat reconciliation test ${workerId}`,
      hostname: workerId,
      ipAddress: '100.100.0.24',
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
  assert(response.ok, 'registered heartbeat reconciliation worker');
}

async function createDeployment(name) {
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
  assert(
    !String(payload.message || '').includes('in-memory'),
    `control plane is using PostgreSQL for ${name} (message: ${payload.message || 'none'})`
  );
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
    if (response.ok && payload.hasTask === true) return payload.task;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`worker did not claim heartbeat reconciliation deployment (response: ${JSON.stringify(lastPayload)})`);
}

async function reportRunning(task) {
  const response = await fetch(`${base}/api/v1/internal/deployments/${task.deploymentId}/result`, {
    method: 'POST',
    headers: workerHeaders,
    body: JSON.stringify({
      deploymentId: task.deploymentId,
      workerId,
      attemptId: task.attemptId,
      state: 'running',
      containerId: `cwc-test-${task.deploymentId}`,
      assignedPort: 39002,
    }),
  });
  assert(response.status === 200, 'running result is accepted');
}

async function heartbeat(activeWorkloadIds) {
  return fetch(`${base}/api/v1/workers/heartbeat`, {
    method: 'POST',
    headers: workerHeaders,
    body: JSON.stringify({
      workerId,
      state: activeWorkloadIds.length > 0 ? 'busy' : 'idle',
      resources: {
        cpuCount: 4,
        cpuUsagePercent: 5,
        totalMemoryMb: 8192,
        freeMemoryMb: 4096,
        usedMemoryMb: 4096,
        activeContainers: activeWorkloadIds.length,
      },
      activeWorkloadIds,
      timestamp: new Date().toISOString(),
    }),
  });
}

async function main() {
  await waitForDatabase();
  const enrollmentId = `${workerId}-first-heartbeat`;
  try {
    const payload = {
      workerId: enrollmentId,
      state: 'draining',
      resources: {
        cpuCount: 4, cpuUsagePercent: 5, totalMemoryMb: 8192,
        freeMemoryMb: 4096, usedMemoryMb: 4096, activeContainers: 0,
      },
      activeWorkloadIds: [],
      timestamp: new Date().toISOString(),
    };
    const rejected = await fetch(`${base}/api/v1/workers/heartbeat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert(rejected.status === 401, 'first heartbeat still requires worker authentication');
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(`${base}/api/v1/workers/heartbeat`, {
        method: 'POST', headers: workerHeaders, body: JSON.stringify(payload),
      });
      assert(response.status === 200, 'unregistered local worker can enroll and repeat its heartbeat');
    }
    const enrolled = await pool.query(
      'SELECT ip_address, state FROM worker_nodes WHERE id = $1', [enrollmentId]
    );
    assert(enrolled.rows.length === 1, 'heartbeat creates exactly one worker row');
    assert(
      ['127.0.0.1', '::1'].includes(enrolled.rows[0]?.ip_address),
      'heartbeat enrollment accepts a non-Tailscale loopback source'
    );
  } finally {
    await pool.query('DELETE FROM worker_nodes WHERE id = $1', [enrollmentId]);
  }
  await registerWorker();

  const staleId = await createDeployment('Heartbeat stale workload');
  const staleTask = await poll();
  await reportRunning(staleTask);
  await pool.query(
    "UPDATE deployments SET public_url = 'https://heartbeat-stale.example.test', routing_status = 'ready', started_at = now() - interval '1 minute', updated_at = now() WHERE id = $1",
    [staleId]
  );

  const staleHeartbeat = await heartbeat([]);
  assert(staleHeartbeat.status === 200, 'empty heartbeat is accepted');

  const staleRow = await pool.query(
    'SELECT state, public_url, routing_status FROM deployments WHERE id = $1',
    [staleId]
  );
  const workerRow = await pool.query('SELECT active_containers FROM worker_nodes WHERE id = $1', [workerId]);
  assert(staleRow.rows[0]?.state === 'failed', 'missing running workload is marked failed');
  assert(staleRow.rows[0]?.public_url === null, 'heartbeat reconciliation clears public URL');
  assert(staleRow.rows[0]?.routing_status === 'failed', 'heartbeat reconciliation marks route failed');
  assert(workerRow.rows[0]?.active_containers === 0, 'heartbeat telemetry clears stale active container count');

  const event = await pool.query(
    "SELECT count(*)::int AS count FROM deployment_events WHERE deployment_id = $1 AND event_type = 'WORKER_HEARTBEAT_RECONCILED'",
    [staleId]
  );
  assert(event.rows[0]?.count === 1, 'heartbeat reconciliation records one lifecycle event');

  const recentId = await createDeployment('Heartbeat recent workload');
  const recentTask = await poll();
  await reportRunning(recentTask);
  const recentHeartbeat = await heartbeat([]);
  assert(recentHeartbeat.status === 200, 'second empty heartbeat is accepted');
  const recentRow = await pool.query('SELECT state FROM deployments WHERE id = $1', [recentId]);
  assert(recentRow.rows[0]?.state === 'running', 'recent running workload survives the grace period');
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
