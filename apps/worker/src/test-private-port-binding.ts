import assert from 'node:assert/strict';
import {
  createPrivateDockerPortSpec,
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

console.log('Private Docker port binding tests passed.');
