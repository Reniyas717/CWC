import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import {
  createGatewayServer,
  CaddyAdminClient,
  QuickTunnel,
  RouteManager,
  validateRouteInput,
} from './gateway.mjs';

const healthServer = createServer((_request, response) => {
  response.writeHead(200).end('ok');
});
healthServer.listen(0, '127.0.0.1');
await once(healthServer, 'listening');
const healthPort = healthServer.address().port;
const calls = [];
const caddy = {
  async apply(route) {
    calls.push(['apply', route]);
  },
  async remove(id) {
    calls.push(['remove', id]);
  },
};
const tunnels = [];
const tunnelExitHandlers = [];
const tunnel = {
  async start(port, options = {}) {
    const record = {
      url: `https://demo-${port}-${tunnels.length}.trycloudflare.com`,
      stopped: false,
    };
    tunnels.push(record);
    tunnelExitHandlers.push(options.onExit);
    return {
      url: record.url,
      stop: () => {
        record.stopped = true;
      },
    };
  },
};
let probeAvailable = false;
const manager = new RouteManager({
  caddy,
  tunnel,
  listenerBase: 19000,
  probe: (_url, options) =>
    probeAvailable
      ? fetch(`http://127.0.0.1:${healthPort}/`, options)
      : Promise.resolve(new Response('unavailable', { status: 503 })),
});
const server = createGatewayServer({ manager, token: 'test-token' });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const servicePort = server.address().port;
const endpoint = `http://127.0.0.1:${servicePort}/v1/routes/demo`;

let response = await fetch(endpoint);
assert.equal(response.status, 401);

response = await fetch(endpoint, {
  method: 'POST',
  headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
  body: JSON.stringify({ oversized: 'x'.repeat(1024 * 1024 + 1) }),
});
assert.equal(response.status, 413);
assert.equal((await response.json()).error.code, 'REQUEST_BODY_TOO_LARGE');

response = await fetch(endpoint, {
  method: 'POST',
  headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
  body: JSON.stringify({ upstreamIp: '100.70.86.53', upstreamPort: healthPort }),
});
assert.equal(response.status, 502);

probeAvailable = true;
response = await fetch(endpoint, {
  method: 'POST',
  headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
  body: JSON.stringify({ upstreamIp: '100.70.86.53', upstreamPort: healthPort, healthPath: '/' }),
});
assert.equal(response.status, 201);
const published = await response.json();
assert.equal(published.data.status, 'ready');
assert.match(published.data.publicUrl, /^https:\/\/.*\.trycloudflare\.com$/);
assert.equal(calls[0][0], 'apply');

response = await fetch(endpoint, { headers: { authorization: 'Bearer test-token' } });
assert.equal(response.status, 200);
assert.equal((await response.json()).data.publicUrl, published.data.publicUrl);

await tunnelExitHandlers[0]();
await new Promise((resolve) => setTimeout(resolve, 1100));
const recovered = manager.get('demo');
assert.equal(recovered.status, 'ready');
assert.notEqual(recovered.publicUrl, published.data.publicUrl);
assert.equal(tunnels[0].stopped, true);
assert.equal(tunnels.length, 2);

response = await fetch(endpoint, {
  method: 'PUT',
  headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
  body: JSON.stringify({ upstreamIp: '100.70.86.53', upstreamPort: healthPort, healthPath: '/' }),
});
assert.equal(response.status, 201);
const replaced = await response.json();
assert.notEqual(replaced.data.publicUrl, published.data.publicUrl);
assert.equal(tunnels[1].stopped, true);

const tunnelStart = tunnel.start;
let failNextTunnel = true;
tunnel.start = async (port) => {
  if (failNextTunnel) {
    failNextTunnel = false;
    throw new Error('simulated tunnel failure');
  }
  return tunnelStart(port);
};
response = await fetch(endpoint, {
  method: 'PUT',
  headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
  body: JSON.stringify({ upstreamIp: '100.70.86.53', upstreamPort: healthPort }),
});
assert.equal(response.status, 500);
response = await fetch(endpoint, { headers: { authorization: 'Bearer test-token' } });
assert.equal((await response.json()).data.publicUrl, replaced.data.publicUrl);

let restartFailures = 1;
tunnel.start = async (port, options) => {
  if (restartFailures > 0) {
    restartFailures -= 1;
    throw new Error('transient tunnel restart failure');
  }
  return tunnelStart(port, options);
};
await tunnelExitHandlers[2]();
await new Promise((resolve) => setTimeout(resolve, 1100));
assert.equal(manager.get('demo').status, 'restarting');
await new Promise((resolve) => setTimeout(resolve, 2200));
assert.equal(manager.get('demo').status, 'ready');

response = await fetch(endpoint, {
  method: 'DELETE',
  headers: { authorization: 'Bearer test-token' },
});
assert.equal(response.status, 200);
assert.equal(tunnels[1].stopped, true);
response = await fetch(endpoint, { headers: { authorization: 'Bearer test-token' } });
assert.equal(response.status, 404);

// Cleanup for an obsolete attempt must not remove a newer route. Repeated
// cleanup is idempotent once the current route is gone.
const versionedEndpoint = `http://127.0.0.1:${servicePort}/v1/routes/versioned`;
response = await fetch(versionedEndpoint, {
  method: 'POST',
  headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
  body: JSON.stringify({
    upstreamIp: '100.70.86.53',
    upstreamPort: healthPort,
    attemptId: 'attempt-old',
  }),
});
assert.equal(response.status, 201);
response = await fetch(versionedEndpoint, {
  method: 'POST',
  headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
  body: JSON.stringify({
    upstreamIp: '100.70.86.53',
    upstreamPort: healthPort,
    attemptId: 'attempt-new',
  }),
});
assert.equal(response.status, 201);
response = await fetch(`${versionedEndpoint}?attemptId=attempt-old`, {
  method: 'DELETE',
  headers: { authorization: 'Bearer test-token' },
});
assert.equal(response.status, 200);
assert.equal((await response.json()).data.status, 'superseded');
response = await fetch(versionedEndpoint, { headers: { authorization: 'Bearer test-token' } });
assert.equal((await response.json()).data.attemptId, 'attempt-new');
response = await fetch(`${versionedEndpoint}?attemptId=attempt-new`, {
  method: 'DELETE',
  headers: { authorization: 'Bearer test-token' },
});
assert.equal(response.status, 200);
response = await fetch(`${versionedEndpoint}?attemptId=attempt-new`, {
  method: 'DELETE',
  headers: { authorization: 'Bearer test-token' },
});
assert.equal(response.status, 200);

const restored = await manager.reconcile(async () => [
  {
    deploymentId: 'restored',
    upstreamIp: '100.70.86.53',
    upstreamPort: healthPort,
    healthPath: '/',
  },
]);
assert.equal(restored[0].status, 'ready');
assert.equal(manager.get('restored').status, 'ready');

response = await fetch(`http://127.0.0.1:${servicePort}/v1/reconcile`, {
  method: 'POST',
  headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
  body: JSON.stringify({
    routes: [
      { deploymentId: 'api-restored', upstreamIp: '100.70.86.53', upstreamPort: healthPort },
    ],
  }),
});
assert.equal(response.status, 200);
assert.equal((await response.json()).data[0].deploymentId, 'api-restored');

response = await fetch(`http://127.0.0.1:${servicePort}/v1/reconcile`, {
  method: 'POST',
  headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
  body: JSON.stringify({
    routes: [{ deploymentId: 'bad/id', upstreamIp: '100.70.86.53', upstreamPort: healthPort }],
  }),
});
assert.equal(response.status, 400);
assert.equal((await response.json()).error.code, 'INVALID_DEPLOYMENT_ID');
assert.equal(manager.get('api-restored').status, 'ready');

await assert.rejects(
  manager.reconcile(async () => {
    throw new Error('control plane unavailable');
  }),
  (error) => error.code === 'RECONCILIATION_UNAVAILABLE'
);
assert.throws(() => manager.get('restored'), /route was not found/);

assert.throws(
  () =>
    validateRouteInput({ deploymentId: 'bad/id', upstreamIp: '100.70.86.53', upstreamPort: 80 }),
  /safe route identifier/
);
assert.throws(
  () => validateRouteInput({ deploymentId: 'demo', upstreamIp: '127.0.0.1', upstreamPort: 80 }),
  /Tailscale IPv4/
);
assert.throws(() => validateRouteInput(null), /route input must be an object/);
assert.throws(
  () => validateRouteInput({ deploymentId: 'demo', upstreamIp: '100.256.1.1', upstreamPort: 80 }),
  /Tailscale IPv4/
);

let caddyConfig;
const caddyClient = new CaddyAdminClient('http://127.0.0.1:2019', async (_url, options) => {
  caddyConfig = JSON.parse(options.body);
  return new Response('', { status: 200 });
});
await caddyClient.apply({
  deploymentId: 'config-check',
  listenerPort: 19001,
  upstreamIp: '100.70.86.53',
  upstreamPort: 8080,
  healthPath: '/health',
});
const caddyRoute = caddyConfig.apps.http.servers['cwc-config-check'].routes[0].handle[0];
assert.deepEqual(caddyRoute.health_checks.active, {
  uri: '/health',
  interval: '5s',
  timeout: '2s',
});
const failingCaddy = new CaddyAdminClient('http://127.0.0.1:2019', async () => {
  throw new Error('connection reset');
});
await assert.rejects(
  failingCaddy.apply({
    deploymentId: 'rollback-check',
    listenerPort: 19003,
    upstreamIp: '100.70.86.53',
    upstreamPort: 8080,
    healthPath: '/',
  }),
  (error) => error.code === 'CADDY_UPDATE_FAILED'
);
assert.equal(failingCaddy.routes.get('rollback-check'), undefined);

const tunnelOutput = new PassThrough();
const tunnelErrors = new PassThrough();
const tunnelChild = new (class extends EventTarget {
  constructor() {
    super();
    this.stdout = tunnelOutput;
    this.stderr = tunnelErrors;
  }
  once(event, handler) {
    this.addEventListener(event, (value) => handler(value.detail));
  }
  kill() {
    this.dispatchEvent(new CustomEvent('exit', { detail: 0 }));
  }
})();
const quickTunnel = new QuickTunnel(() => tunnelChild);
const tunnelPromise = quickTunnel.start(19002);
tunnelErrors.write('diagnostic output\n');
tunnelOutput.write('INF https://brisk-moon.trycloudflare.com\n');
const quickTunnelResult = await tunnelPromise;
assert.equal(quickTunnelResult.url, 'https://brisk-moon.trycloudflare.com');
quickTunnelResult.stop();

server.close();
healthServer.close();
console.log(
  'ok - gateway publication API authenticates, validates, probes, publishes and removes routes'
);
