/**
 * Phase 5 Heartbeat Sweeper & Failure Recovery Verification Suite
 * Tests:
 * 1. Healthy workers are preserved
 * 2. Missed heartbeats (>30s) transition worker to 'offline' and purge Redis lease
 * 3. Active in-flight deployments are auto-rescheduled to 'queued' with retry count incremented
 * 4. Healthy workers can immediately pick up failover tasks
 * 5. Deployments exceeding max retries (3) are transitioned to 'failed'
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const base = process.env.API_BASE_URL || 'http://localhost:4000';
const adminToken = process.env.ADMIN_TOKEN || 'dev-admin-token-change-in-production';
const workerToken =
  process.env.WORKER_SECRET_TOKEN || 'dev-worker-secret-token-change-in-production';
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

async function runPhase5Tests() {
  console.log('🚀 Starting Phase 5 Sweeper & Failure Recovery Test Suite against', base);
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // Clean up any stale queued deployments from previous test runs so queue starts clean
    await pool.query("UPDATE deployments SET state = 'cancelled' WHERE state = 'queued'");

    // -------------------------------------------------------------------------
    // TEST 1: Healthy Worker is NOT affected by Sweeper
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1: Healthy worker preserved during sweep ---');
    const healthyWorkerId = `worker-healthy-${Date.now()}`;
    await fetch(`${base}/api/v1/workers/register`, {
      method: 'POST',
      headers: workerHeaders,
      body: JSON.stringify({
        id: healthyWorkerId,
        name: 'Healthy Worker',
        hostname: 'healthy-host',
        ipAddress: '100.100.0.3',
        port: 5001,
        authToken: workerToken,
        resources: {
          cpuCount: 8,
          cpuUsagePercent: 20,
          totalMemoryMb: 16384,
          freeMemoryMb: 12000,
          usedMemoryMb: 4384,
          activeContainers: 0,
        },
        limits: { maxConcurrentWorkloads: 5, maxMemoryMb: 8192, maxCpuCores: 4 },
        version: '0.1.0',
      }),
    });

    const sweepRes1 = await fetch(`${base}/api/v1/workers/sweep`, {
      method: 'POST',
      headers: adminHeaders,
    });
    const sweepJson1 = await sweepRes1.json();
    assert(
      sweepRes1.status === 200 && sweepJson1.success === true,
      'Sweep endpoint executed successfully'
    );
    assert(
      !sweepJson1.data.offlineWorkers.includes(healthyWorkerId),
      'Healthy worker was NOT marked offline'
    );

    const checkHealthy = await pool.query('SELECT state FROM worker_nodes WHERE id = $1', [
      healthyWorkerId,
    ]);
    assert(checkHealthy.rows[0].state === 'idle', 'Healthy worker state remains idle in DB');

    // -------------------------------------------------------------------------
    // TEST 2: Missed Heartbeats (>30s) marks Worker Offline & Clears Redis
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Missed heartbeats (>30s) marks worker offline ---');
    const deadWorkerId = `worker-dead-${Date.now()}`;
    await fetch(`${base}/api/v1/workers/register`, {
      method: 'POST',
      headers: workerHeaders,
      body: JSON.stringify({
        id: deadWorkerId,
        name: 'Dead Worker 1',
        hostname: 'dead-host',
        ipAddress: '100.100.0.4',
        port: 5001,
        authToken: workerToken,
        resources: {
          cpuCount: 4,
          cpuUsagePercent: 15,
          totalMemoryMb: 8192,
          freeMemoryMb: 6000,
          usedMemoryMb: 2192,
          activeContainers: 1,
        },
        limits: { maxConcurrentWorkloads: 2, maxMemoryMb: 4096, maxCpuCores: 2 },
        version: '0.1.0',
      }),
    });

    // Age last_heartbeat_at to 45 seconds ago
    const pastTime = new Date(Date.now() - 45_000);
    await pool.query('UPDATE worker_nodes SET last_heartbeat_at = $1 WHERE id = $2', [
      pastTime,
      deadWorkerId,
    ]);

    const sweepRes2 = await fetch(`${base}/api/v1/workers/sweep`, {
      method: 'POST',
      headers: adminHeaders,
    });
    const sweepJson2 = await sweepRes2.json();
    assert(
      sweepJson2.data.offlineWorkers.includes(deadWorkerId),
      `Worker '${deadWorkerId}' detected as offline in sweep results`
    );

    const checkDead = await pool.query(
      'SELECT state, active_containers FROM worker_nodes WHERE id = $1',
      [deadWorkerId]
    );
    assert(checkDead.rows[0].state === 'offline', 'Worker state in PostgreSQL is now offline');
    assert(checkDead.rows[0].active_containers === 0, 'Worker active_containers reset to 0');

    // -------------------------------------------------------------------------
    // TEST 3: In-flight Deployment Rescheduled When Worker Fails
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Active deployment auto-rescheduled on worker failure ---');
    const workerWithTask = `worker-failover-${Date.now()}`;
    await fetch(`${base}/api/v1/workers/register`, {
      method: 'POST',
      headers: workerHeaders,
      body: JSON.stringify({
        id: workerWithTask,
        name: 'Worker With Task',
        hostname: 'failover-host',
        ipAddress: '100.100.0.5',
        port: 5001,
        authToken: workerToken,
        resources: {
          cpuCount: 4,
          cpuUsagePercent: 15,
          totalMemoryMb: 8192,
          freeMemoryMb: 6000,
          usedMemoryMb: 2192,
          activeContainers: 0,
        },
        limits: { maxConcurrentWorkloads: 3, maxMemoryMb: 4096, maxCpuCores: 2 },
        version: '0.1.0',
      }),
    });

    // Create deployment on this worker
    const createDepRes = await fetch(`${base}/api/v1/deployments`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'Reschedule Test App',
        framework: 'dockerfile',
        git: { repositoryUrl: 'https://github.com/cloud-without-clouds/reschedule-app.git' },
        port: 3000,
        workerId: workerWithTask,
      }),
    });
    const createDepJson = await createDepRes.json();
    const depId = createDepJson.data.id;

    // Rejected active deletes must not call the gateway first. The 400 is
    // deterministic even when the gateway is unavailable, protecting a live
    // route from an accidental delete attempt.
    const activeDeleteRes = await fetch(`${base}/api/v1/deployments/${depId}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    const activeDeleteJson = await activeDeleteRes.json();
    assert(
      activeDeleteRes.status === 400 && activeDeleteJson.error?.code === 'ACTIVE_DEPLOYMENT',
      'active deployment delete is rejected before gateway cleanup'
    );

    // Worker polls task -> transitions to 'building'
    await fetch(`${base}/api/v1/workers/${workerWithTask}/tasks`, { headers: workerHeaders });

    // The deployment may also be in the image-to-container transition; that
    // state must be protected by the same delete guard.
    await pool.query("UPDATE deployments SET state = 'deploying' WHERE id = $1", [depId]);
    const deployingDeleteRes = await fetch(`${base}/api/v1/deployments/${depId}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    const deployingDeleteJson = await deployingDeleteRes.json();
    assert(
      deployingDeleteRes.status === 400 && deployingDeleteJson.error?.code === 'ACTIVE_DEPLOYMENT',
      'deploying deployment delete is rejected before gateway cleanup'
    );

    // Worker reports running result
    await fetch(`${base}/api/v1/internal/deployments/${depId}/result`, {
      method: 'POST',
      headers: workerHeaders,
      body: JSON.stringify({
        deploymentId: depId,
        workerId: workerWithTask,
        state: 'running',
        containerId: 'cont-to-reschedule-99',
        assignedPort: 48999,
      }),
    });

    // Verify deployment is running
    const checkRunning = await pool.query(
      'SELECT state, retry_count FROM deployments WHERE id = $1',
      [depId]
    );
    assert(checkRunning.rows[0].state === 'running', 'Deployment initially confirmed running');
    assert(checkRunning.rows[0].retry_count === 0, 'Initial retry_count is 0');

    // Worker dies: age heartbeat to 60 seconds ago
    await pool.query('UPDATE worker_nodes SET last_heartbeat_at = $1 WHERE id = $2', [
      new Date(Date.now() - 60_000),
      workerWithTask,
    ]);

    // Trigger sweep
    const sweepRes3 = await fetch(`${base}/api/v1/workers/sweep`, {
      method: 'POST',
      headers: adminHeaders,
    });
    const sweepJson3 = await sweepRes3.json();
    assert(
      sweepJson3.data.offlineWorkers.includes(workerWithTask),
      `Dead worker detected in sweep`
    );
    assert(
      sweepJson3.data.rescheduledDeployments.includes(depId),
      `Deployment '${depId}' was auto-rescheduled`
    );

    // Verify database state of deployment
    const checkRecovered = await pool.query(
      'SELECT state, worker_id, container_id, assigned_port, retry_count FROM deployments WHERE id = $1',
      [depId]
    );
    assert(checkRecovered.rows[0].state === 'queued', `Deployment state reset to 'queued'`);
    assert(checkRecovered.rows[0].worker_id === null, 'worker_id unset (null) for re-assignment');
    assert(checkRecovered.rows[0].container_id === null, 'container_id cleared');
    assert(checkRecovered.rows[0].assigned_port === null, 'assigned_port cleared');
    assert(checkRecovered.rows[0].retry_count === 1, 'retry_count incremented to 1');

    // Verify discrete audit event
    const checkEvents = await pool.query(
      "SELECT event_type, details FROM deployment_events WHERE deployment_id = $1 AND event_type = 'RESCHEDULED'",
      [depId]
    );
    assert(
      checkEvents.rows.length > 0,
      'RESCHEDULED event successfully recorded in deployment_events'
    );

    // -------------------------------------------------------------------------
    // TEST 4: Failover Task Pickup by Another Worker
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Failover task pickup by fresh worker ---');
    const rescueWorkerId = `worker-rescue-${Date.now()}`;
    await fetch(`${base}/api/v1/workers/register`, {
      method: 'POST',
      headers: workerHeaders,
      body: JSON.stringify({
        id: rescueWorkerId,
        name: 'Rescue Worker',
        hostname: 'rescue-host',
        ipAddress: '100.100.0.6',
        port: 5001,
        authToken: workerToken,
        resources: {
          cpuCount: 8,
          cpuUsagePercent: 10,
          totalMemoryMb: 16384,
          freeMemoryMb: 14000,
          usedMemoryMb: 2384,
          activeContainers: 0,
        },
        limits: { maxConcurrentWorkloads: 5, maxMemoryMb: 8192, maxCpuCores: 4 },
        version: '0.1.0',
      }),
    });

    const rescuePoll = await fetch(`${base}/api/v1/workers/${rescueWorkerId}/tasks`, {
      headers: workerHeaders,
    });
    const rescueJson = await rescuePoll.json();
    assert(rescueJson.hasTask === true, 'Rescue worker polled and received task');
    assert(
      rescueJson.task.deploymentId === depId,
      'Received task matches the rescheduled deployment'
    );

    const checkRescued = await pool.query(
      'SELECT state, worker_id FROM deployments WHERE id = $1',
      [depId]
    );
    assert(
      checkRescued.rows[0].state === 'building',
      `Deployment locked to rescue worker with state 'building'`
    );
    assert(
      checkRescued.rows[0].worker_id === rescueWorkerId,
      `worker_id updated to rescue worker '${rescueWorkerId}'`
    );

    // -------------------------------------------------------------------------
    // TEST 5: Max Retry Limit (3) Marks Deployment FAILED
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Exceeding max retries marks deployment as failed ---');
    const maxRetryWorker = `worker-maxretry-${Date.now()}`;
    await fetch(`${base}/api/v1/workers/register`, {
      method: 'POST',
      headers: workerHeaders,
      body: JSON.stringify({
        id: maxRetryWorker,
        name: 'Max Retry Worker',
        hostname: 'maxretry-host',
        ipAddress: '100.100.0.7',
        port: 5001,
        authToken: workerToken,
        resources: {
          cpuCount: 4,
          cpuUsagePercent: 10,
          totalMemoryMb: 8192,
          freeMemoryMb: 6000,
          usedMemoryMb: 2192,
          activeContainers: 0,
        },
        limits: { maxConcurrentWorkloads: 2, maxMemoryMb: 4096, maxCpuCores: 2 },
        version: '0.1.0',
      }),
    });

    const depMaxRes = await fetch(`${base}/api/v1/deployments`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'Max Retry Exhaustion App',
        framework: 'dockerfile',
        git: { repositoryUrl: 'https://github.com/cloud-without-clouds/exhaust-app.git' },
        port: 3000,
        workerId: maxRetryWorker,
      }),
    });
    const depMaxJson = await depMaxRes.json();
    const maxDepId = depMaxJson.data.id;

    // Simulate 3 prior retries and running state
    await pool.query("UPDATE deployments SET retry_count = 3, state = 'running' WHERE id = $1", [
      maxDepId,
    ]);

    // Worker dies
    await pool.query('UPDATE worker_nodes SET last_heartbeat_at = $1 WHERE id = $2', [
      new Date(Date.now() - 60_000),
      maxRetryWorker,
    ]);

    // Trigger sweep
    const sweepRes4 = await fetch(`${base}/api/v1/workers/sweep`, {
      method: 'POST',
      headers: adminHeaders,
    });
    const sweepJson4 = await sweepRes4.json();
    assert(
      sweepJson4.data.failedDeployments.includes(maxDepId),
      `Deployment '${maxDepId}' identified in failedDeployments`
    );

    const checkMaxFailed = await pool.query(
      'SELECT state, error_message, finished_at FROM deployments WHERE id = $1',
      [maxDepId]
    );
    assert(checkMaxFailed.rows[0].state === 'failed', `Deployment state is now 'failed'`);
    assert(
      checkMaxFailed.rows[0].error_message.includes(
        'maximum recovery retry limit (3) was exceeded'
      ),
      'Error message describes retry exhaustion'
    );
    assert(checkMaxFailed.rows[0].finished_at !== null, 'finished_at timestamp recorded');

    const checkFailedEvent = await pool.query(
      "SELECT event_type, details FROM deployment_events WHERE deployment_id = $1 AND event_type = 'FAILED'",
      [maxDepId]
    );
    assert(checkFailedEvent.rows.length > 0, 'FAILED event logged in deployment_events');
  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  } finally {
    await pool.end();
  }

  console.log('\n==================================================');
  console.log(
    `Phase 5 Verification Summary: ${passed} passed, ${failed} failed, ${passed + failed} total`
  );
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase5Tests();
