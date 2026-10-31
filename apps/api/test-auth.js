/**
 * Automated Verification Suite for Auth & Worker Endpoints
 * Tests all authorization permutations across public, admin, and worker endpoints.
 */

const base = process.env.API_BASE_URL || 'http://localhost:4000';
const adminToken = process.env.ADMIN_TOKEN || 'dev-admin-token-change-in-production';
const workerToken = process.env.WORKER_SECRET_TOKEN || 'dev-worker-secret-token-change-in-production';
const wrongToken = 'completely-wrong-token-12345';

const sampleWorkerRegistration = {
  id: 'worker-auth-test-01',
  name: 'Auth Test Worker',
  hostname: 'auth-host',
  ipAddress: '100.100.0.1',
  port: 5001,
  authToken: workerToken,
  resources: {
    cpuCount: 8,
    cpuUsagePercent: 15,
    totalMemoryMb: 8192,
    freeMemoryMb: 6144,
    usedMemoryMb: 2048,
    activeContainers: 0,
  },
  limits: {
    maxConcurrentWorkloads: 4,
    maxMemoryMb: 4096,
    maxCpuCores: 2,
  },
  version: '0.1.0',
};

const sampleHeartbeat = {
  workerId: 'worker-auth-test-01',
  state: 'idle',
  resources: {
    cpuCount: 8,
    cpuUsagePercent: 15,
    totalMemoryMb: 8192,
    freeMemoryMb: 6144,
    usedMemoryMb: 2048,
    activeContainers: 0,
  },
  activeWorkloadIds: [],
  timestamp: new Date().toISOString(),
};

const sampleStatus = {
  workerId: 'worker-auth-test-01',
  state: 'idle',
  timestamp: new Date().toISOString(),
};

const sampleDeployment = {
  name: 'Auth Test App',
  framework: 'dockerfile',
  git: {
    repositoryUrl: 'https://github.com/cloud-without-clouds/sample-node-app.git',
    branch: 'main',
  },
  port: 3000,
};

const tests = [
  { name: '1. Health endpoint (Public)', url: '/health', method: 'GET', headers: {}, expectedStatus: 200 },

  // Admin endpoints (Deployments create/cancel)
  { name: '2a. Deployments POST without token', url: '/api/v1/deployments', method: 'POST', headers: {}, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '2b. Deployments POST with malformed header', url: '/api/v1/deployments', method: 'POST', headers: { Authorization: 'Basic xyz' }, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '2c. Deployments POST with wrong token', url: '/api/v1/deployments', method: 'POST', headers: { Authorization: 'Bearer ' + wrongToken }, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '2d. Deployments POST with worker token instead of admin', url: '/api/v1/deployments', method: 'POST', headers: { Authorization: 'Bearer ' + workerToken }, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '2e. Deployments POST with valid admin token', url: '/api/v1/deployments', method: 'POST', headers: { Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json' }, body: JSON.stringify(sampleDeployment), expectedStatus: 201 },

  { name: '3a. Deployments CANCEL without token', url: '/api/v1/deployments/dep-nonexistent/cancel', method: 'POST', headers: {}, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '3b. Deployments CANCEL with valid admin token (returns 404 for unknown)', url: '/api/v1/deployments/dep-nonexistent/cancel', method: 'POST', headers: { Authorization: 'Bearer ' + adminToken }, expectedStatus: 404, checkCode: 'NOT_FOUND' },

  // Worker endpoints (Register, heartbeat, status, tasks)
  { name: '4a. Workers REGISTER without token', url: '/api/v1/workers/register', method: 'POST', headers: {}, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '4b. Workers REGISTER with wrong token', url: '/api/v1/workers/register', method: 'POST', headers: { Authorization: 'Bearer ' + wrongToken }, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '4c. Workers REGISTER with admin token instead of worker', url: '/api/v1/workers/register', method: 'POST', headers: { Authorization: 'Bearer ' + adminToken }, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '4d. Workers REGISTER with valid worker token and payload', url: '/api/v1/workers/register', method: 'POST', headers: { Authorization: 'Bearer ' + workerToken, 'Content-Type': 'application/json' }, body: JSON.stringify(sampleWorkerRegistration), expectedStatus: 200 },

  { name: '5a. Workers HEARTBEAT without token', url: '/api/v1/workers/heartbeat', method: 'POST', headers: {}, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '5b. Workers HEARTBEAT with valid worker token and payload', url: '/api/v1/workers/heartbeat', method: 'POST', headers: { Authorization: 'Bearer ' + workerToken, 'Content-Type': 'application/json' }, body: JSON.stringify(sampleHeartbeat), expectedStatus: 200 },

  { name: '6a. Workers STATUS without token', url: '/api/v1/workers/status', method: 'POST', headers: {}, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '6b. Workers STATUS with valid worker token and payload', url: '/api/v1/workers/status', method: 'POST', headers: { Authorization: 'Bearer ' + workerToken, 'Content-Type': 'application/json' }, body: JSON.stringify(sampleStatus), expectedStatus: 200 },

  { name: '7a. Workers TASKS poll without token', url: '/api/v1/workers/worker-auth-test-01/tasks', method: 'GET', headers: {}, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '7b. Workers TASKS poll with wrong token', url: '/api/v1/workers/worker-auth-test-01/tasks', method: 'GET', headers: { Authorization: 'Bearer ' + wrongToken }, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '7c. Workers TASKS poll with valid worker token', url: '/api/v1/workers/worker-auth-test-01/tasks', method: 'GET', headers: { Authorization: 'Bearer ' + workerToken }, expectedStatus: 200 },

  // Internal worker reporting endpoints
  { name: '8a. Internal result reporting without token', url: '/api/v1/internal/deployments/dep-nonexistent/result', method: 'POST', headers: {}, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '8b. Internal result reporting with admin token (worker required)', url: '/api/v1/internal/deployments/dep-nonexistent/result', method: 'POST', headers: { Authorization: 'Bearer ' + adminToken }, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '8c. Internal logs reporting without token', url: '/api/v1/internal/deployments/dep-nonexistent/logs', method: 'POST', headers: {}, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },

  // Optional admin endpoints (GET /deployments, GET /workers)
  { name: '9a. Deployments GET without token (dev mode open)', url: '/api/v1/deployments', method: 'GET', headers: {}, expectedStatus: 200 },
  { name: '9b. Deployments GET with wrong token (rejected)', url: '/api/v1/deployments', method: 'GET', headers: { Authorization: 'Bearer ' + wrongToken }, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '9c. Deployments GET with valid admin token', url: '/api/v1/deployments', method: 'GET', headers: { Authorization: 'Bearer ' + adminToken }, expectedStatus: 200 },

  { name: '10a. Workers GET without token (dev mode open)', url: '/api/v1/workers', method: 'GET', headers: {}, expectedStatus: 200 },
  { name: '10b. Workers GET with wrong token (rejected)', url: '/api/v1/workers', method: 'GET', headers: { Authorization: 'Bearer ' + wrongToken }, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '10c. Workers GET with valid admin token', url: '/api/v1/workers', method: 'GET', headers: { Authorization: 'Bearer ' + adminToken }, expectedStatus: 200 },
];

async function main() {
  console.log('🚀 Running Full Auth & Worker Endpoint Verification Suite against', base);
  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      const res = await fetch(base + t.url, { method: t.method, headers: t.headers, body: t.body });
      const json = await res.json().catch(() => ({}));
      const statusOk = res.status === t.expectedStatus;
      const codeOk = t.checkCode ? json.error?.code === t.checkCode : true;

      if (statusOk && codeOk) {
        console.log(`  ✅ PASS: ${t.name} -> HTTP ${res.status}`);
        passed++;
      } else {
        console.log(`  ❌ FAIL: ${t.name} -> Expected HTTP ${t.expectedStatus}, got ${res.status}`);
        console.log('     Response body:', JSON.stringify(json));
        failed++;
      }
    } catch (e) {
      console.log(`  ❌ ERROR: ${t.name} -> ${e.message}`);
      failed++;
    }
  }

  console.log('\n==================================================');
  console.log(`Verification Summary: ${passed} passed, ${failed} failed, ${tests.length} total`);
  console.log('==================================================');
  if (failed > 0) process.exit(1);
}

main();
