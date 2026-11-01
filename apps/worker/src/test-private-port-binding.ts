import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  createPrivateDockerPortSpec,
  DockerEngine,
  isDockerHostBindingError,
  validatePrivateDockerBinding,
} from './services/docker-engine.js';

const tailscaleIp = '100.107.77.37';

assert.equal(
  createPrivateDockerPortSpec(tailscaleIp, 8080),
  '100.107.77.37:0:8080',
  'Docker publish syntax must bind an ephemeral host port to the Tailscale address'
);

assert.deepEqual(
  validatePrivateDockerBinding({ hostIp: tailscaleIp, hostPort: 32768 }, tailscaleIp),
  { hostIp: tailscaleIp, hostPort: 32768 },
  'a binding on the registered Tailscale address is accepted'
);

assert.throws(
  () => validatePrivateDockerBinding({ hostIp: '0.0.0.0', hostPort: 32768 }, tailscaleIp),
  /instead of the worker Tailscale address/,
  'wildcard IPv4 bindings must be rejected'
);

assert.throws(
  () => validatePrivateDockerBinding({ hostIp: '::', hostPort: 32768 }, tailscaleIp),
  /instead of the worker Tailscale address/,
  'wildcard IPv6 bindings must be rejected'
);

assert.throws(
  () => validatePrivateDockerBinding({ hostIp: '192.168.1.10', hostPort: 32768 }, tailscaleIp),
  /instead of the worker Tailscale address/,
  'bindings on another interface must be rejected'
);

assert.throws(
  () => validatePrivateDockerBinding({ hostIp: tailscaleIp, hostPort: 0 }, tailscaleIp),
  /invalid private host port/,
  'Docker must return a usable assigned host port'
);

assert.equal(
  isDockerHostBindingError(new Error('cannot assign requested address')),
  true,
  'Docker Desktop address binding failures should activate the WSL proxy fallback'
);
assert.equal(
  isDockerHostBindingError(new Error('manifest unknown')),
  false,
  'image/runtime failures must not be retried with a different network binding'
);

const upstream = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end('proxy-ok');
});

await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', () => resolve()));
const upstreamAddress = upstream.address();
assert.ok(upstreamAddress && typeof upstreamAddress !== 'string');

const engine = new DockerEngine();
const proxy = await engine.createTailscaleProxy(
  'proxy-test',
  '127.0.0.1',
  upstreamAddress.port
);
const proxyResponse = await fetch(`http://127.0.0.1:${proxy.port}/`);
assert.equal(proxyResponse.status, 200, 'proxy should forward HTTP traffic');
assert.equal(await proxyResponse.text(), 'proxy-ok');
await proxy.close();
await new Promise<void>((resolve) => upstream.close(() => resolve()));

console.log('Private Docker port binding tests passed.');
