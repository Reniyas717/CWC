/**
 * Phase 4 End-to-End Integration Test Suite
 * Validates the full deployment lifecycle:
 * Creation -> Task Polling -> Log Streaming -> Result Reporting -> Cancellation
 */

const base = process.env.API_BASE_URL || 'http://localhost:4000';
const adminToken = process.env.ADMIN_TOKEN || 'dev-admin-token-change-in-production';
const workerToken = process.env.WORKER_SECRET_TOKEN || 'dev-worker-secret-token-change-in-production';

const adminHeaders = {
  Authorization: `Bearer ${adminToken}`,
  'Content-Type': 'application/json',
};

const workerHeaders = {
  Authorization: `Bearer ${workerToken}`,
  'Content-Type': 'application/json',
};

async function runPhase4Tests() {
  console.log('🚀 Starting Phase 4 End-to-End Integration Verification Suite...');
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
    // 1. Register a dedicated worker
    const workerId = `worker-p4-${Date.now()}`;
    const regRes = await fetch(`${base}/api/v1/workers/register`, {
      method: 'POST',
      headers: workerHeaders,
      body: JSON.stringify({
        id: workerId,
        name: 'Phase 4 Test Worker',
        hostname: 'p4-worker-host',
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
        limits: {
          maxConcurrentWorkloads: 5,
          maxMemoryMb: 4096,
          maxCpuCores: 2,
        },
        version: '0.1.0',
      }),
    });
    const regJson = await regRes.json();
    assert(regRes.status === 200 && regJson.acknowledged === true, `Worker registered (${workerId})`);

    // 2. Create a new deployment
    const createRes = await fetch(`${base}/api/v1/deployments`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'Phase 4 Verification App',
        framework: 'dockerfile',
        git: {
          repositoryUrl: 'https://github.com/cloud-without-clouds/demo-app.git',
          branch: 'main',
          rootDirectory: '/',
        },
        port: 8080,
        workerId: workerId,
        resourceLimits: {
          cpuLimitCores: 1.5,
          memoryLimitMb: 768,
        },
      }),
    });
    const createJson = await createRes.json();
    assert(createRes.status === 201 && createJson.success === true, 'Deployment created with 201 Created');
    const deploymentId = createJson.data?.id;
    assert(deploymentId && createJson.data?.state === 'queued', `Deployment ID obtained (${deploymentId}), state is 'queued'`);

    // 3. Verify deployment in list
    const listRes = await fetch(`${base}/api/v1/deployments?applicationId=${createJson.data.applicationId}`);
    const listJson = await listRes.json();
    assert(listRes.status === 200 && listJson.data.some((d) => d.id === deploymentId), 'Deployment found in GET /api/v1/deployments query');

    // 4. Worker polls for task
    const pollRes = await fetch(`${base}/api/v1/workers/${workerId}/tasks`, {
      headers: workerHeaders,
    });
    const pollJson = await pollRes.json();
    assert(pollRes.status === 200 && pollJson.hasTask === true, 'Worker polled and received pending task');
    assert(pollJson.task?.deploymentId === deploymentId, 'Received task matches deployment ID');
    assert(pollJson.task?.targetPort === 8080, 'Task targetPort matches 8080');

    // 5. Verify deployment state transitioned to 'building'
    const getDepRes1 = await fetch(`${base}/api/v1/deployments/${deploymentId}`);
    const getDepJson1 = await getDepRes1.json();
    assert(getDepJson1.data?.state === 'building', `Deployment state automatically updated to 'building' on task dispatch`);

    // 6. Worker flushes logs
    const logRes = await fetch(`${base}/api/v1/internal/deployments/${deploymentId}/logs`, {
      method: 'POST',
      headers: workerHeaders,
      body: JSON.stringify({
        deploymentId,
        workerId,
        logs: [
          {
            timestamp: new Date().toISOString(),
            stream: 'stdout',
            level: 'info',
            message: 'Cloning repository from https://github.com/cloud-without-clouds/demo-app.git...',
          },
          {
            timestamp: new Date().toISOString(),
            stream: 'stdout',
            level: 'info',
            message: 'Building Docker container image...',
          },
        ],
      }),
    });
    const logJson = await logRes.json();
    assert(logRes.status === 200 && logJson.count === 2, 'Worker flushed 2 log entries');

    // 7. Verify logs retrieved from API
    const getLogsRes = await fetch(`${base}/api/v1/deployments/${deploymentId}/logs`);
    const getLogsJson = await getLogsRes.json();
    assert(getLogsRes.status === 200 && getLogsJson.count === 2, 'API returned 2 stored logs');
    assert(getLogsJson.data[0].message.includes('Cloning'), 'First log entry contains repository cloning step');

    // 8. Worker reports container result (running)
    const resultRes = await fetch(`${base}/api/v1/internal/deployments/${deploymentId}/result`, {
      method: 'POST',
      headers: workerHeaders,
      body: JSON.stringify({
        deploymentId,
        workerId,
        state: 'running',
        containerId: 'cwc-cont-8849201',
        assignedPort: 49152,
        publicUrl: 'http://localhost:49152',
        gitCommitHash: 'a1b2c3d4e5f6',
      }),
    });
    const resultJson = await resultRes.json();
    assert(resultRes.status === 200 && resultJson.state === 'running', 'Worker reported state as running');

    // 9. Verify deployment detail reflects running state and assigned port
    const getDepRes2 = await fetch(`${base}/api/v1/deployments/${deploymentId}`);
    const getDepJson2 = await getDepRes2.json();
    assert(getDepJson2.data?.state === 'running', `Deployment is confirmed 'running'`);
    assert(getDepJson2.data?.assignedPort === 49152, `Assigned host port is 49152`);
    assert(getDepJson2.data?.containerId === 'cwc-cont-8849201', `Container ID recorded`);

    // 10. Worker second poll returns no tasks
    const pollRes2 = await fetch(`${base}/api/v1/workers/${workerId}/tasks`, {
      headers: workerHeaders,
    });
    const pollJson2 = await pollRes2.json();
    assert(pollJson2.hasTask === false, 'Subsequent worker poll correctly returns hasTask: false');

    // 11. Test deployment cancellation
    const createCancelRes = await fetch(`${base}/api/v1/deployments`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        name: 'App To Cancel',
        framework: 'dockerfile',
        git: { repositoryUrl: 'https://github.com/cloud-without-clouds/demo-app.git' },
        port: 3000,
      }),
    });
    const createCancelJson = await createCancelRes.json();
    const cancelDepId = createCancelJson.data?.id;

    const cancelRes = await fetch(`${base}/api/v1/deployments/${cancelDepId}/cancel`, {
      method: 'POST',
      headers: adminHeaders,
    });
    const cancelJson = await cancelRes.json();
    assert(cancelRes.status === 200 && cancelJson.state === 'cancelled', `Deployment '${cancelDepId}' cancelled successfully`);

    const verifyCancelRes = await fetch(`${base}/api/v1/deployments/${cancelDepId}`);
    const verifyCancelJson = await verifyCancelRes.json();
    assert(verifyCancelJson.data?.state === 'cancelled', `Deployment state verified as 'cancelled' in DB`);

  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  }

  console.log('\n==================================================');
  console.log(`Phase 4 Integration Summary: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase4Tests();
