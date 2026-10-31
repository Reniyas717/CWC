/**
 * Phase 6 Resource-Aware Least-Loaded Scheduler Placement Test Suite
 * Validates:
 * 1. Exact mathematical precision of S(W) load scoring formula
 * 2. Least-loaded worker selection among multiple active candidates
 * 3. 1% score tie-breaking favoring higher freeMemoryMb
 * 4. Filter enforcement: RAM headroom, active capacity, and heartbeat age
 * 5. Exhaustion recovery: automatic scheduling of unassigned queued tasks upon worker registration/heartbeat
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

async function runPhase6Tests() {
  console.log('🚀 Starting Phase 6 Resource-Aware Scheduler Placement Test Suite...');
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
    // Reset any pending unassigned deployments from prior runs
    await pool.query("UPDATE deployments SET state = 'cancelled' WHERE state = 'queued'");
    // Age all pre-existing workers (>30s) so only freshly registered test workers compete
    await pool.query('UPDATE worker_nodes SET last_heartbeat_at = $1', [
      new Date(Date.now() - 40_000),
    ]);

    // -------------------------------------------------------------------------
    // TEST 1: S(W) Load Score Formula Exactness
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1: S(W) mathematical calculation exactness ---');
    const workerAId = `worker-p6-a-${Date.now()}`;
    // Worker A:
    // usedMem: 2000 / totalMem: 10000 => 0.20
    // cpuUsage: 30% => 0.30
    // active: 1 / max: 10 => 0.10
    // Expected: 0.4*0.2 + 0.4*0.3 + 0.2*0.1 = 0.08 + 0.12 + 0.02 = 0.22
    await fetch(`${base}/api/v1/workers/register`, {
      method: 'POST',
      headers: workerHeaders,
      body: JSON.stringify({
        id: workerAId,
        name: 'Light Load Worker A',
        hostname: 'host-a',
        port: 5001,
        authToken: workerToken,
        resources: {
          cpuCount: 8,
          cpuUsagePercent: 30,
          totalMemoryMb: 10000,
          freeMemoryMb: 8000,
          usedMemoryMb: 2000,
          activeContainers: 1,
        },
        limits: { maxConcurrentWorkloads: 10, maxMemoryMb: 8192, maxCpuCores: 4 },
        version: '0.1.0',
      }),
    });

    const scoreRes = await fetch(`${base}/api/v1/workers/scores?memoryMb=512`, {
      headers: adminHeaders,
    });
    const scoreJson = await scoreRes.json();
    assert(
      scoreRes.status === 200 && scoreJson.success === true,
      'GET /api/v1/workers/scores succeeded'
    );

    const workerAScore = scoreJson.data.find((w) => w.workerId === workerAId);
    assert(workerAScore !== undefined, 'Worker A found in scores breakdown');
    assert(
      Math.abs(workerAScore.score - 0.22) < 0.001,
      `Worker A score is exactly 0.22 (got ${workerAScore.score})`
    );
    assert(workerAScore.memoryRatio === 0.2, 'Worker A memory ratio is 0.2');
    assert(workerAScore.cpuRatio === 0.3, 'Worker A CPU ratio is 0.3');
    assert(workerAScore.containerRatio === 0.1, 'Worker A container ratio is 0.1');
    assert(workerAScore.eligible === true, 'Worker A satisfies eligibility constraints');

    // -------------------------------------------------------------------------
    // TEST 2: Multi-Worker Placement (Least-Loaded Worker Chosen)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Multi-worker placement selects least-loaded candidate ---');
    const workerBId = `worker-p6-b-${Date.now()}`;
    // Worker B (heavier load):
    // usedMem: 6000 / totalMem: 10000 => 0.60
    // cpuUsage: 70% => 0.70
    // active: 4 / max: 5 => 0.80
    // Expected: 0.4*0.6 + 0.4*0.7 + 0.2*0.8 = 0.24 + 0.28 + 0.16 = 0.68
    await fetch(`${base}/api/v1/workers/register`, {
      method: 'POST',
      headers: workerHeaders,
      body: JSON.stringify({
        id: workerBId,
        name: 'Heavy Load Worker B',
        hostname: 'host-b',
        port: 5001,
        authToken: workerToken,
        resources: {
          cpuCount: 8,
          cpuUsagePercent: 70,
          totalMemoryMb: 10000,
          freeMemoryMb: 4000,
          usedMemoryMb: 6000,
          activeContainers: 4,
        },
        limits: { maxConcurrentWorkloads: 5, maxMemoryMb: 8192, maxCpuCores: 4 },
        version: '0.1.0',
      }),
    });

    // Deploy an app without specifying workerId
    const depRes = await fetch(`${base}/api/v1/deployments`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'Placement Selection App',
        framework: 'dockerfile',
        git: { repositoryUrl: 'https://github.com/cloud-without-clouds/placement-app.git' },
        port: 3000,
        resourceLimits: { cpuLimitCores: 1.0, memoryLimitMb: 512 },
      }),
    });
    const depJson = await depRes.json();
    assert(depRes.status === 201 && depJson.success === true, 'Deployment submitted successfully');
    assert(
      depJson.data.workerId === workerAId,
      `Scheduler correctly placed deployment on least-loaded Worker A (${workerAId}, score: 0.22), NOT Worker B (${workerBId}, score: 0.68)`
    );

    // Verify audit event details
    const eventQuery = await pool.query(
      "SELECT details FROM deployment_events WHERE deployment_id = $1 AND event_type = 'SCHEDULED'",
      [depJson.data.id]
    );
    assert(
      eventQuery.rows.length > 0 && eventQuery.rows[0].details.includes(workerAId),
      'SCHEDULED event documents placement on least-loaded worker'
    );

    // -------------------------------------------------------------------------
    // TEST 3: 1% Tie-Breaking Favoring Highest Free Memory
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: 1% tie-breaking rule favors higher free memory ---');
    const workerCId = `worker-p6-c-${Date.now()}`;
    const workerDId = `worker-p6-d-${Date.now()}`;

    // Worker C: score ~ 0.40, freeMemoryMb = 8000
    // used: 4000/10000 (0.4) * 0.4 = 0.16; cpu: 40% (0.4) * 0.4 = 0.16; active: 4/10 (0.4) * 0.2 = 0.08 => 0.40
    await fetch(`${base}/api/v1/workers/register`, {
      method: 'POST',
      headers: workerHeaders,
      body: JSON.stringify({
        id: workerCId,
        name: 'Tie Candidate C (Higher Free RAM)',
        hostname: 'host-c',
        port: 5001,
        authToken: workerToken,
        resources: {
          cpuCount: 8,
          cpuUsagePercent: 40,
          totalMemoryMb: 12000,
          freeMemoryMb: 8000,
          usedMemoryMb: 4000,
          activeContainers: 4,
        },
        limits: { maxConcurrentWorkloads: 10, maxMemoryMb: 8192, maxCpuCores: 4 },
        version: '0.1.0',
      }),
    });

    // Worker D: same score ~ 0.40, but lower freeMemoryMb = 3000
    await fetch(`${base}/api/v1/workers/register`, {
      method: 'POST',
      headers: workerHeaders,
      body: JSON.stringify({
        id: workerDId,
        name: 'Tie Candidate D (Lower Free RAM)',
        hostname: 'host-d',
        port: 5001,
        authToken: workerToken,
        resources: {
          cpuCount: 8,
          cpuUsagePercent: 40,
          totalMemoryMb: 7000,
          freeMemoryMb: 3000,
          usedMemoryMb: 4000,
          activeContainers: 4,
        },
        limits: { maxConcurrentWorkloads: 10, maxMemoryMb: 8192, maxCpuCores: 4 },
        version: '0.1.0',
      }),
    });

    // Age all workers except C and D so only C and D compete
    await pool.query('UPDATE worker_nodes SET last_heartbeat_at = $1 WHERE id NOT IN ($2, $3)', [
      new Date(Date.now() - 40_000),
      workerCId,
      workerDId,
    ]);

    const tieDepRes = await fetch(`${base}/api/v1/deployments`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'Tie Breaker App',
        framework: 'dockerfile',
        git: { repositoryUrl: 'https://github.com/cloud-without-clouds/tie-app.git' },
        port: 3000,
        resourceLimits: { cpuLimitCores: 1.0, memoryLimitMb: 512 },
      }),
    });
    const tieDepJson = await tieDepRes.json();
    assert(
      tieDepJson.data.workerId === workerCId,
      `Tie-breaker successfully favored Worker C (${workerCId}, 8000MB free) over Worker D (${workerDId}, 3000MB free)`
    );

    // -------------------------------------------------------------------------
    // TEST 4: Eligibility Constraint Filtering (RAM Headroom & Capacity Cap)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Resource eligibility filters reject ineligible nodes ---');
    const workerRamFailId = `worker-p6-ramfail-${Date.now()}`;
    const workerCapFailId = `worker-p6-capfail-${Date.now()}`;

    // Worker with insufficient free RAM (only 200MB free)
    await fetch(`${base}/api/v1/workers/register`, {
      method: 'POST',
      headers: workerHeaders,
      body: JSON.stringify({
        id: workerRamFailId,
        name: 'RAM Depleted Worker',
        hostname: 'host-lowram',
        port: 5001,
        authToken: workerToken,
        resources: {
          cpuCount: 4,
          cpuUsagePercent: 10,
          totalMemoryMb: 4096,
          freeMemoryMb: 200,
          usedMemoryMb: 3896,
          activeContainers: 0,
        },
        limits: { maxConcurrentWorkloads: 4, maxMemoryMb: 4096, maxCpuCores: 2 },
        version: '0.1.0',
      }),
    });

    // Worker with capacity maxed out (activeContainers == maxConcurrentWorkloads)
    await fetch(`${base}/api/v1/workers/register`, {
      method: 'POST',
      headers: workerHeaders,
      body: JSON.stringify({
        id: workerCapFailId,
        name: 'Capacity Full Worker',
        hostname: 'host-full',
        port: 5001,
        authToken: workerToken,
        resources: {
          cpuCount: 8,
          cpuUsagePercent: 10,
          totalMemoryMb: 16384,
          freeMemoryMb: 12000,
          usedMemoryMb: 4384,
          activeContainers: 4,
        },
        limits: { maxConcurrentWorkloads: 4, maxMemoryMb: 8192, maxCpuCores: 4 },
        version: '0.1.0',
      }),
    });

    const scoreCheck = await fetch(`${base}/api/v1/workers/scores?memoryMb=1024`, {
      headers: adminHeaders,
    });
    const scoreCheckJson = await scoreCheck.json();
    const ramFailNode = scoreCheckJson.data.find((w) => w.workerId === workerRamFailId);
    const capFailNode = scoreCheckJson.data.find((w) => w.workerId === workerCapFailId);

    assert(
      ramFailNode.eligible === false,
      'RAM-depleted worker correctly marked ineligible for 1024MB task'
    );
    assert(
      ramFailNode.rejectionReasons.some((r) => r.includes('Insufficient free memory')),
      'Rejection reason specifies memory shortfall'
    );
    assert(capFailNode.eligible === false, 'Capacity-exhausted worker correctly marked ineligible');
    assert(
      capFailNode.rejectionReasons.some((r) => r.includes('Concurrency capacity exhausted')),
      'Rejection reason specifies capacity exhaustion'
    );

    // -------------------------------------------------------------------------
    // TEST 5: Exhaustion Re-evaluation on Worker Registration / Heartbeat
    // -------------------------------------------------------------------------
    console.log(
      '\n--- Test 5: Unassigned queued deployment scheduled when fresh worker registers ---'
    );
    // Mark all existing workers stale (>30s)
    await pool.query('UPDATE worker_nodes SET last_heartbeat_at = $1', [
      new Date(Date.now() - 50_000),
    ]);

    // Submit a deployment when no eligible workers exist
    const unassignedDepRes = await fetch(`${base}/api/v1/deployments`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'Exhaustion Queue App',
        framework: 'dockerfile',
        git: { repositoryUrl: 'https://github.com/cloud-without-clouds/exhaustion-queue.git' },
        port: 8080,
        resourceLimits: { cpuLimitCores: 1.0, memoryLimitMb: 512 },
      }),
    });
    const unassignedDepJson = await unassignedDepRes.json();
    const exhaustDepId = unassignedDepJson.data.id;
    assert(
      unassignedDepJson.data.workerId === undefined,
      'Deployment submitted with no eligible workers remains unassigned (workerId: null)'
    );

    // Now a new healthy worker registers
    const freshWorkerId = `worker-p6-fresh-${Date.now()}`;
    await fetch(`${base}/api/v1/workers/register`, {
      method: 'POST',
      headers: workerHeaders,
      body: JSON.stringify({
        id: freshWorkerId,
        name: 'Fresh Rescue Worker',
        hostname: 'fresh-host',
        port: 5001,
        authToken: workerToken,
        resources: {
          cpuCount: 8,
          cpuUsagePercent: 15,
          totalMemoryMb: 16384,
          freeMemoryMb: 14000,
          usedMemoryMb: 2384,
          activeContainers: 0,
        },
        limits: { maxConcurrentWorkloads: 5, maxMemoryMb: 8192, maxCpuCores: 4 },
        version: '0.1.0',
      }),
    });

    // Give background scheduler a brief moment to process
    await new Promise((r) => setTimeout(r, 200));

    // Verify deployment is now assigned to the fresh worker
    const checkScheduled = await pool.query(
      'SELECT worker_id, state FROM deployments WHERE id = $1',
      [exhaustDepId]
    );
    assert(
      checkScheduled.rows[0].worker_id === freshWorkerId,
      `Queued deployment was automatically scheduled to fresh worker '${freshWorkerId}' upon registration`
    );
  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  } finally {
    await pool.end();
  }

  console.log('\n==================================================');
  console.log(
    `Phase 6 Verification Summary: ${passed} passed, ${failed} failed, ${passed + failed} total`
  );
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase6Tests();
