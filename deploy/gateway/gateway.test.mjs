import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createGatewayServer, RouteManager, validateRouteInput } from './gateway.mjs';

const healthServer = createServer((_request, response) => {
  response.writeHead(200).end('ok');
});
healthServer.listen(0, '127.0.0.1');
await once(healthServer, 'listening');
const healthPort = healthServer.address().port;
const calls = [];
const caddy = {
  async apply(route) { calls.push(['apply', route]); },
  async remove(id) { calls.push(['remove', id]); },
};
const tunnels = [];
const tunnel = {
  async start(port) {
    const record = { url: `https://demo-${port}.trycloudflare.com`, stopped: false };
    tunnels.push(record);
    return { url: record.url, stop: () => { record.stopped = true; } };
  },
};
let probeAvailable = false;
const manager = new RouteManager({
  caddy,
  tunnel,
  listenerBase: 19000,
  probe: (_url, options) => probeAvailable
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

response = await fetch(endpoint, { method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, body: JSON.stringify({ upstreamIp: '100.70.86.53', upstreamPort: healthPort }) });
assert.equal(response.status, 502);

probeAvailable = true;
response = await fetch(endpoint, { method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, body: JSON.stringify({ upstreamIp: '100.70.86.53', upstreamPort: healthPort, healthPath: '/' }) });
assert.equal(response.status, 201);
const published = await response.json();
assert.equal(published.data.status, 'ready');
assert.match(published.data.publicUrl, /^https:\/\/.*\.trycloudflare\.com$/);
assert.equal(calls[0][0], 'apply');

response = await fetch(endpoint, { headers: { authorization: 'Bearer test-token' } });
assert.equal(response.status, 200);
assert.equal((await response.json()).data.publicUrl, published.data.publicUrl);

response = await fetch(endpoint, { method: 'DELETE', headers: { authorization: 'Bearer test-token' } });
assert.equal(response.status, 200);
assert.equal(tunnels[0].stopped, true);
response = await fetch(endpoint, { headers: { authorization: 'Bearer test-token' } });
assert.equal(response.status, 404);

assert.throws(() => validateRouteInput({ deploymentId: 'bad/id', upstreamIp: '100.70.86.53', upstreamPort: 80 }), /safe route identifier/);
assert.throws(() => validateRouteInput({ deploymentId: 'demo', upstreamIp: '127.0.0.1', upstreamPort: 80 }), /Tailscale IPv4/);

server.close();
healthServer.close();
console.log('ok - gateway publication API authenticates, validates, probes, publishes and removes routes');
