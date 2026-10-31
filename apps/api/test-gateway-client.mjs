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

console.log('ok - gateway route removal retries with attempt identity');
