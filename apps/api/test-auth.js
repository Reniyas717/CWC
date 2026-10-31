/**
 * Automated Verification Suite for Phase 2: Auth Middleware
 * Tests all authorization permutations across public, admin, and worker endpoints.
 */

const base = process.env.API_BASE_URL || 'http://localhost:4000';
const adminToken = process.env.ADMIN_TOKEN || 'dev-admin-token-change-in-production';
const workerToken = process.env.WORKER_SECRET_TOKEN || 'dev-worker-secret-token-change-in-production';
const wrongToken = 'completely-wrong-token-12345';

const tests = [
  { name: '1. Health endpoint (Public)', url: '/health', method: 'GET', headers: {}, expectedStatus: 200 },

  // Admin endpoints (Deployments create/cancel)
  { name: '2a. Deployments POST without token', url: '/api/v1/deployments', method: 'POST', headers: {}, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '2b. Deployments POST with malformed header', url: '/api/v1/deployments', method: 'POST', headers: { Authorization: 'Basic xyz' }, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '2c. Deployments POST with wrong token', url: '/api/v1/deployments', method: 'POST', headers: { Authorization: 'Bearer ' + wrongToken }, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '2d. Deployments POST with worker token instead of admin', url: '/api/v1/deployments', method: 'POST', headers: { Authorization: 'Bearer ' + workerToken }, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '2e. Deployments POST with valid admin token', url: '/api/v1/deployments', method: 'POST', headers: { Authorization: 'Bearer ' + adminToken }, expectedStatus: 501 },

  { name: '3a. Deployments CANCEL without token', url: '/api/v1/deployments/dep-1/cancel', method: 'POST', headers: {}, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '3b. Deployments CANCEL with valid admin token', url: '/api/v1/deployments/dep-1/cancel', method: 'POST', headers: { Authorization: 'Bearer ' + adminToken }, expectedStatus: 501 },

  // Worker endpoints (Register, heartbeat, status, tasks)
  { name: '4a. Workers REGISTER without token', url: '/api/v1/workers/register', method: 'POST', headers: {}, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '4b. Workers REGISTER with wrong token', url: '/api/v1/workers/register', method: 'POST', headers: { Authorization: 'Bearer ' + wrongToken }, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '4c. Workers REGISTER with admin token instead of worker', url: '/api/v1/workers/register', method: 'POST', headers: { Authorization: 'Bearer ' + adminToken }, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '4d. Workers REGISTER with valid worker token', url: '/api/v1/workers/register', method: 'POST', headers: { Authorization: 'Bearer ' + workerToken }, expectedStatus: 501 },

  { name: '5a. Workers HEARTBEAT without token', url: '/api/v1/workers/heartbeat', method: 'POST', headers: {}, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '5b. Workers HEARTBEAT with valid worker token', url: '/api/v1/workers/heartbeat', method: 'POST', headers: { Authorization: 'Bearer ' + workerToken }, expectedStatus: 501 },

  { name: '6a. Workers STATUS without token', url: '/api/v1/workers/status', method: 'POST', headers: {}, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '6b. Workers STATUS with valid worker token', url: '/api/v1/workers/status', method: 'POST', headers: { Authorization: 'Bearer ' + workerToken }, expectedStatus: 501 },

  { name: '7a. Workers TASKS poll without token', url: '/api/v1/workers/w1/tasks', method: 'GET', headers: {}, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '7b. Workers TASKS poll with wrong token', url: '/api/v1/workers/w1/tasks', method: 'GET', headers: { Authorization: 'Bearer ' + wrongToken }, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '7c. Workers TASKS poll with valid worker token', url: '/api/v1/workers/w1/tasks', method: 'GET', headers: { Authorization: 'Bearer ' + workerToken }, expectedStatus: 200 },

  // Optional admin endpoints (GET /deployments, GET /workers)
  { name: '8a. Deployments GET without token (dev mode open)', url: '/api/v1/deployments', method: 'GET', headers: {}, expectedStatus: 200 },
  { name: '8b. Deployments GET with wrong token (rejected)', url: '/api/v1/deployments', method: 'GET', headers: { Authorization: 'Bearer ' + wrongToken }, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '8c. Deployments GET with valid admin token', url: '/api/v1/deployments', method: 'GET', headers: { Authorization: 'Bearer ' + adminToken }, expectedStatus: 200 },

  { name: '9a. Workers GET without token (dev mode open)', url: '/api/v1/workers', method: 'GET', headers: {}, expectedStatus: 200 },
  { name: '9b. Workers GET with wrong token (rejected)', url: '/api/v1/workers', method: 'GET', headers: { Authorization: 'Bearer ' + wrongToken }, expectedStatus: 401, checkCode: 'UNAUTHORIZED' },
  { name: '9c. Workers GET with valid admin token', url: '/api/v1/workers', method: 'GET', headers: { Authorization: 'Bearer ' + adminToken }, expectedStatus: 200 },
];

async function main() {
  console.log('🚀 Running Phase 2 Full Auth Verification Suite against', base);
  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      const res = await fetch(base + t.url, { method: t.method, headers: t.headers });
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
