import os from 'os';
import { TailscaleIpv4Schema } from '@cloud-without-clouds/shared';

type NetworkInterfaces = ReturnType<typeof os.networkInterfaces>;

/**
 * Resolve the worker's private Tailscale address for registration.
 *
 * An explicit TAILSCALE_IP is authoritative and is validated before use.
 * Without it, only non-internal IPv4 interfaces in Tailscale's CGNAT range
 * are candidates. The worker fails closed when no usable address exists.
 */
export function discoverTailscaleAddress(
  configuredAddress: string | undefined = process.env.TAILSCALE_IP,
  networkInterfaces: NetworkInterfaces = os.networkInterfaces()
): string {
  if (configuredAddress !== undefined) {
    const parsed = TailscaleIpv4Schema.safeParse(configuredAddress);
    if (!parsed.success) {
      throw new Error(
        `Configured TAILSCALE_IP is not a valid Tailscale IPv4 address: ${configuredAddress}`
      );
    }
    return parsed.data;
  }

  for (const ifaceList of Object.values(networkInterfaces)) {
    if (!ifaceList) continue;
    for (const iface of ifaceList) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      if (TailscaleIpv4Schema.safeParse(iface.address).success) {
        return iface.address;
      }
    }
  }

  throw new Error(
    'No valid Tailscale IPv4 address was found; set TAILSCALE_IP or connect Tailscale before starting the worker'
  );
}
