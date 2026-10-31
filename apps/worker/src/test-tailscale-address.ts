import assert from 'node:assert/strict';
import { discoverTailscaleAddress } from './services/tailscale-address.js';

const tailscaleInterfaces = {
  Ethernet: [
    {
      address: '192.168.1.10',
      netmask: '255.255.255.0',
      family: 'IPv4',
      mac: '00:00:00:00:00:01',
      internal: false,
      cidr: '192.168.1.10/24',
    },
    {
      address: '100.100.20.7',
      netmask: '255.192.0.0',
      family: 'IPv4',
      mac: '00:00:00:00:00:02',
      internal: false,
      cidr: '100.100.20.7/10',
    },
  ],
} as ReturnType<typeof import('node:os').networkInterfaces>;

assert.equal(
  discoverTailscaleAddress(undefined, tailscaleInterfaces),
  '100.100.20.7',
  'discovery should select the Tailscale IPv4 address from host interfaces'
);

assert.equal(
  discoverTailscaleAddress('100.101.30.8', tailscaleInterfaces),
  '100.101.30.8',
  'an explicitly configured Tailscale address should take precedence'
);

assert.throws(
  () => discoverTailscaleAddress('192.168.1.10', tailscaleInterfaces),
  /valid Tailscale IPv4 address/,
  'a configured non-Tailscale address must not be registered'
);

assert.throws(
  () =>
    discoverTailscaleAddress(undefined, {
      Ethernet: [
        {
          address: '192.168.1.10',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: '00:00:00:00:00:01',
          internal: false,
          cidr: '192.168.1.10/24',
        },
      ],
    } as ReturnType<typeof import('node:os').networkInterfaces>),
  /valid Tailscale IPv4 address/,
  'workers without a Tailscale interface must fail closed'
);

console.log('Tailscale address discovery tests passed.');
