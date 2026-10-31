/**
 * Task-claim integration checks.
 *
 * Start the API and PostgreSQL first, then run:
 *   node apps/api/test-task-claim.js
 *
 * The checks use the worker task-polling HTTP seam and only clean up rows
 * created by this run.
 */
import pg from 'pg';

const base = process.env.API_BASE_URL || 'http://localhost:4000';
const adminToken = process.env.ADMIN_TOKEN || 'dev-admin-token-change-in-production';
const workerToken = process.env.WORKER_SECRET_TOKEN || 'dev-worker-secret-token-change-in-production';
const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://cwc_user:cwc_password@localhost:5432/cloud_without_clouds?schema=public';

const adminHeaders = {
  Authorization: `Bearer ${adminToken}`,
  'Content-Type': 'application/json',
};
const workerHeaders = {
  Authorization: `Bearer ${workerToken}`,
  'Content-Type': 'application/json',
};

const pool = new pg.Pool({ connectionString: databaseUrl });
const runId = Date.now();
const created = { workerIds: [], deploymentIds: [], applicationIds: [] };

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS: ${message}`);
}

async function registerWorker(id, freeMemoryMb = 4096) {
  const response = await fetch(`${base}/api/v1/workers/register`, {
    method: 'POST',
    headers: workerHeaders,
    body: JSON.stringify({
      id,
      name: `Task claim test ${id}`,
      hostname: id,
      port: 5001,
      authToken: workerToken,
      resources: {
        cpuCount: 4,
        cpuUsagePercent: 5,
        totalMemoryMb: 8192,
        freeMemoryMb,
        usedMemoryMb: 8192 - freeMemoryMb,
        activeContainers: 0,
      },
      limits: { maxConcurrentWorkloads: 1, maxMemoryMb: 4096, maxCpuCores: 2 },
      version: '0.1.0',
    }),
  });
  assert(response.ok, `registered worker ${id}`);
  created.workerIds.push(id);
}

async function createDeployment(workerId, name, memoryLimitMb = 512) {
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
      resourceLimits: { cpuLimitCores: 1, memoryLimitMb },
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
  return response.json();
}

async function main() {
  const workerId = `claim-worker-${runId}`;
  await registerWorker(workerId);

  // Two simultaneous polls against one queued task have exactly one winner.
  const firstDeploymentId = await createDeployment(workerId, 'Atomic claim');
  const firstPolls = await Promise.all([poll(workerId), poll(workerId)]);
  assert(firstPolls.filter((result) => result.hasTask === true).length === 1, 'concurrent polls produce one claim winner');
  assert(firstPolls.some((result) => result.task?.deploymentId === firstDeploymentId), 'winning poll receives the queued deployment');

  // A building reservation consumes the worker's one available slot.
  const secondDeploymentId = await createDeployment(workerId, 'Capacity boundary');
  const secondPolls = await Promise.all([poll(workerId), poll(workerId)]);
  assert(secondPolls.every((result) => result.hasTask === false), 'capacity boundary prevents a second claim');
  const secondDeployment = await pool.query('SELECT state FROM deployments WHERE id = $1', [secondDeploymentId]);
  assert(secondDeployment.rows[0]?.state === 'queued', 'capacity-rejected deployment remains queued');

  // A worker without enough free memory cannot claim the task.
  const memoryWorkerId = `claim-memory-worker-${runId}`;
  await registerWorker(memoryWorkerId, 128);
  const memoryDeploymentId = await createDeployment(memoryWorkerId, 'Memory boundary');
  const memoryPoll = await poll(memoryWorkerId);
  assert(memoryPoll.hasTask === false, 'insufficient memory is rejected at claim time');
  const memoryDeployment = await pool.query('SELECT state FROM deployments WHERE id = $1', [memoryDeploymentId]);
  assert(memoryDeployment.rows[0]?.state === 'queued', 'memory-rejected deployment remains queued');
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
