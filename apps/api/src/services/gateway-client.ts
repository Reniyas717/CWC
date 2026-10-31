import { env } from '../config/env.js';

export interface PublishedRoute {
  deploymentId: string;
  status: string;
  publicUrl?: string;
  listenerPort?: number;
  upstreamIp: string;
  upstreamPort: number;
  healthPath?: string;
}

export class GatewayClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl = env.GATEWAY_URL, token = env.GATEWAY_TOKEN) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  /**
   * Publishes or updates an ingress route on the Gateway service.
   * If the Gateway reports UPSTREAM_UNAVAILABLE (container HTTP server booting),
   * retries with progressive backoff.
   */
  async publishRoute(
    deploymentId: string,
    upstreamIp: string,
    upstreamPort: number,
    healthPath = '/',
    maxAttempts = 5,
    delayMs = 1500
  ): Promise<PublishedRoute | null> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(
          `${this.baseUrl}/v1/routes/${encodeURIComponent(deploymentId)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.token}`,
            },
            body: JSON.stringify({
              upstreamIp,
              upstreamPort,
              healthPath,
            }),
            signal: AbortSignal.timeout(18000),
          }
        );

        if (response.ok) {
          const body = (await response.json()) as { success: boolean; data: PublishedRoute };
          console.log(
            `[GatewayClient] Route published for ${deploymentId}: ${body.data?.publicUrl || 'ready'}`
          );
          return body.data;
        }

        const errorText = await response.text().catch(() => '');

        // If upstream container is still starting, give it a moment to bind socket
        if (response.status === 502 && attempt < maxAttempts) {
          console.log(
            `[GatewayClient] Upstream http://${upstreamIp}:${upstreamPort}${healthPath} not ready yet (attempt ${attempt}/${maxAttempts}). Retrying in ${delayMs}ms...`
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        console.warn(
          `[GatewayClient] Failed to publish route for ${deploymentId} (${response.status}): ${errorText}`
        );
        return null;
      } catch (error) {
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        console.warn(
          `[GatewayClient] Unable to reach Gateway service at ${this.baseUrl} to publish route for ${deploymentId}:`,
          error instanceof Error ? error.message : String(error)
        );
        return null;
      }
    }
    return null;
  }

  /**
   * Removes an ingress route and terminates any associated Cloudflare Quick Tunnel.
   */
  async removeRoute(deploymentId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/v1/routes/${encodeURIComponent(deploymentId)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!response.ok && response.status !== 404) {
        const errorText = await response.text().catch(() => '');
        console.warn(
          `[GatewayClient] Failed to remove route for ${deploymentId} (${response.status}): ${errorText}`
        );
        return false;
      }

      console.log(`[GatewayClient] Route removed for ${deploymentId}`);
      return true;
    } catch (error) {
      console.warn(
        `[GatewayClient] Unable to reach Gateway service at ${this.baseUrl} to remove route for ${deploymentId}:`,
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }

  /**
   * Reconciles authoritative running routes with the Gateway service.
   */
  async reconcileRoutes(
    routes: Array<{
      deploymentId: string;
      upstreamIp: string;
      upstreamPort: number;
      healthPath?: string;
    }>
  ): Promise<PublishedRoute[] | null> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/reconcile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ routes }),
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.warn(
          `[GatewayClient] Route reconciliation failed (${response.status}): ${errorText}`
        );
        return null;
      }

      const body = (await response.json()) as { success: boolean; data: PublishedRoute[] };
      return body.data;
    } catch (error) {
      console.warn(
        `[GatewayClient] Unable to reach Gateway service at ${this.baseUrl} for reconciliation:`,
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }
}

export const gatewayClient = new GatewayClient();
