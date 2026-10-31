import { env } from '../config/env.js';

export interface PublishedRoute {
  deploymentId: string;
  attemptId?: string;
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
    delayMs = 1500,
    attemptId?: string
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
              ...(attemptId ? { attemptId } : {}),
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

        // A 502 normally means that the worker container is still starting.
        // Other 5xx responses and rate limiting are also transient from the
        // control plane's point of view (for example, a tunnel restart).
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < maxAttempts) {
          console.log(
            `[GatewayClient] Gateway publication returned ${response.status} for ${deploymentId} (attempt ${attempt}/${maxAttempts}). Retrying in ${delayMs}ms...`
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
  async removeRoute(
    deploymentId: string,
    attemptId?: string,
    maxAttempts = 3,
    delayMs = 1000
  ): Promise<boolean> {
    const routeUrl = new URL(`${this.baseUrl}/v1/routes/${encodeURIComponent(deploymentId)}`);
    if (attemptId) routeUrl.searchParams.set('attemptId', attemptId);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(routeUrl, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
          signal: AbortSignal.timeout(10000),
        });

        // A missing route is already in the desired state. The gateway also
        // returns success when an attempt-guarded removal is superseded by a
        // newer route, because the old route must not be touched.
        if (response.ok || response.status === 404) {
          console.log(`[GatewayClient] Route removed for ${deploymentId}`);
          return true;
        }

        const errorText = await response.text().catch(() => '');
        if (attempt < maxAttempts && response.status >= 500) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        console.warn(
          `[GatewayClient] Failed to remove route for ${deploymentId} (${response.status}): ${errorText}`
        );
        return false;
      } catch (error) {
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        console.warn(
          `[GatewayClient] Unable to reach Gateway service at ${this.baseUrl} to remove route for ${deploymentId}:`,
          error instanceof Error ? error.message : String(error)
        );
        return false;
      }
    }

    return false;
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
    }>,
    maxAttempts = 3,
    delayMs = 1000
  ): Promise<PublishedRoute[] | null> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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

        if (response.ok) {
          const body = (await response.json()) as {
            success?: boolean;
            data?: PublishedRoute[];
          };
          if (!body.success || !Array.isArray(body.data)) {
            console.warn('[GatewayClient] Gateway returned an invalid reconciliation response');
            return null;
          }
          return body.data;
        }

        const errorText = await response.text().catch(() => '');
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < maxAttempts) {
          console.warn(
            `[GatewayClient] Route reconciliation returned ${response.status} (attempt ${attempt}/${maxAttempts}). Retrying in ${delayMs}ms...`
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        console.warn(
          `[GatewayClient] Route reconciliation failed (${response.status}): ${errorText}`
        );
        return null;
      } catch (error) {
        if (attempt < maxAttempts) {
          console.warn(
            `[GatewayClient] Gateway reconciliation attempt ${attempt}/${maxAttempts} failed. Retrying in ${delayMs}ms...`
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        console.warn(
          `[GatewayClient] Unable to reach Gateway service at ${this.baseUrl} for reconciliation:`,
          error instanceof Error ? error.message : String(error)
        );
        return null;
      }
    }
    return null;
  }
}

export const gatewayClient = new GatewayClient();
