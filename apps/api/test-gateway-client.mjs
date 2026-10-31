import assert from 'node:assert/strict';
import { GatewayClient } from './src/services/gateway-client.ts';

const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  if (calls.length === 1) throw new Error('temporary gateway outage');
  return new Response(JSON.stringify({ success: true, data: { status: 'removed' } }), {
    status: 200,
  });
};

const client = new GatewayClient('http://gateway.test', 'secret');
assert.equal(await client.removeRoute('demo', 'attempt-old', 2, 0), true);
assert.equal(calls.length, 2);
assert.match(String(calls[0].url), /\/v1\/routes\/demo\?attemptId=attempt-old$/);
assert.equal(calls[0].options.method, 'DELETE');

globalThis.fetch = async () =>
  new Response(JSON.stringify({ success: true, data: { status: 'superseded' } }), { status: 200 });
assert.equal(
  await client.removeRoute('demo', 'attempt-old', 1, 0),
  false,
  'superseded cleanup is not treated as successful removal'
);

const route = {
  deploymentId: 'demo',
  attemptId: 'attempt-new',
  status: 'ready',
  publicUrl: 'https://demo.trycloudflare.com',
  listenerPort: 18080,
  upstreamIp: '100.70.86.53',
  upstreamPort: 8080,
  healthPath: '/',
};
globalThis.fetch = async (_url, options) => {
  const request = JSON.parse(options.body);
  assert.equal(request.attemptId, 'attempt-new');
  return new Response(JSON.stringify({ success: true, data: route }), { status: 201 });
};
const published = await client.publishRoute('demo', '100.70.86.53', 8080, '/', 1, 0, 'attempt-new');
assert.equal(published?.attemptId, 'attempt-new');
assert.equal(published?.publicUrl, 'https://demo.trycloudflare.com');

globalThis.fetch = async () =>
  new Response(
    JSON.stringify({
      success: true,
      data: { ...route, publicUrl: 'http://demo.trycloudflare.com' },
    }),
    { status: 200 }
  );
assert.equal(
  await client.publishRoute('demo', '100.70.86.53', 8080, '/', 1, 0, 'attempt-new'),
  null,
  'non-HTTPS gateway URLs are rejected'
);

globalThis.fetch = async (_url, options) => {
  const request = JSON.parse(options.body);
  assert.equal(request.routes[0].attemptId, 'attempt-new');
  return new Response(JSON.stringify({ success: true, data: [route] }), { status: 200 });
};
const reconciled = await client.reconcileRoutes(
  [{ deploymentId: 'demo', attemptId: 'attempt-new', upstreamIp: '100.70.86.53', upstreamPort: 8080 }],
  1,
  0
);
assert.equal(reconciled?.[0]?.attemptId, 'attempt-new');

console.log('ok - gateway client validates route identity and HTTPS responses');
