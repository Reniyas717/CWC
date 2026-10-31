/**
 * Public API checks for worker Tailscale address registration.
 * Requires the API, PostgreSQL, and Redis to be running.
 */

const base = process.env.API_BASE_URL || 'http://localhost:4000';
const workerToken =
  process.env.WORKER_SECRET_TOKEN || 'dev-worker-secret-token-change-in-production';
const workerId = `worker-network-${Date.now()}`;

const basePayload = (ipAddress) => ({
  id: workerId,
  name: 'Network Test Worker',
  hostname: 'network-test-host',
  ipAddress,
  port: 5001,
  authToken: workerToken,
  resources: {
    cpuCount: 4,
    cpuUsagePercent: 10,
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
});

async function register(payload) {
  return fetch(`${base}/api/v1/workers/register`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${workerToken}`,
      'Content-Type': 'application/json',
      // This deliberately differs from the reported private address.
      'X-Forwarded-For': '192.0.2.20',
    },
    body: JSON.stringify(payload),
  });
}

const first = await register(basePayload('100.100.20.7'));
const firstBody = await first.json();
if (first.status !== 200 || firstBody.worker?.ipAddress !== '100.100.20.7') {
  throw new Error(
    `valid Tailscale address was not stored: ${first.status} ${JSON.stringify(firstBody)}`
  );
}

const changed = await register(basePayload('100.101.30.8'));
const changedBody = await changed.json();
if (changed.status !== 200 || changedBody.worker?.ipAddress !== '100.101.30.8') {
  throw new Error(
    `re-registration did not update the Tailscale address: ${changed.status} ${JSON.stringify(changedBody)}`
  );
}

const missingPayload = basePayload(undefined);
const missing = await register(missingPayload);
if (missing.status !== 400) {
  throw new Error(`missing Tailscale address should be rejected, got HTTP ${missing.status}`);
}

const invalid = await register(basePayload('192.0.2.20'));
if (invalid.status !== 400) {
  throw new Error(`non-Tailscale address should be rejected, got HTTP ${invalid.status}`);
}

console.log('Worker Tailscale registration tests passed.');
