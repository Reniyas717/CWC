import { and, eq, gt, inArray, isNotNull } from 'drizzle-orm';
import { TailscaleIpv4Schema } from '@cloud-without-clouds/shared';
import { db } from '../db/index.js';
import { deployments, workerNodes } from '../db/schema.js';
import { gatewayClient, PublishedRoute } from './gateway-client.js';

// Keep gateway route eligibility aligned with the scheduler's heartbeat lease.
// A worker that has not checked in recently must not be revived by a gateway
// restart, even if its deployment row still says "running".
const ROUTE_HEARTBEAT_TIMEOUT_MS = 30_000;

type AuthoritativeRoute = {
  deploymentId: string;
  upstreamIp: string;
  upstreamPort: number;
  healthPath: string;
  workerId: string;
  attemptId: string | null;
};

export interface GatewayReconciliationResult {
  status: 'reconciled' | 'unavailable';
  desiredRoutes: number;
  publishedRoutes: number;
  updatedDeployments: number;
}

/**
 * Reads the control plane's current deployment and worker state and builds
 * the only route set that the gateway is allowed to restore.
 *
 * This query deliberately excludes stopped/failed deployments, stale worker
 * heartbeats, unsupported worker states, invalid Tailscale addresses, and
 * invalid host ports. An empty result is still authoritative when the query
 * succeeds; a query failure is not.
 */
export async function loadAuthoritativeGatewayRoutes(
  now: Date = new Date()
): Promise<AuthoritativeRoute[]> {
  const cutoff = new Date(now.getTime() - ROUTE_HEARTBEAT_TIMEOUT_MS);
  const rows = await db
    .select({
      deploymentId: deployments.id,
      workerId: deployments.workerId,
      attemptId: deployments.attemptId,
      assignedPort: deployments.assignedPort,
      workerIp: workerNodes.ipAddress,
    })
    .from(deployments)
    .innerJoin(workerNodes, eq(deployments.workerId, workerNodes.id))
    .where(
      and(
        eq(deployments.state, 'running'),
        isNotNull(deployments.workerId),
        isNotNull(deployments.assignedPort),
        inArray(workerNodes.state, ['idle', 'busy']),
        gt(workerNodes.lastHeartbeatAt, cutoff)
      )
    );

  const routes: AuthoritativeRoute[] = [];
  for (const row of rows) {
    const parsedIp = TailscaleIpv4Schema.safeParse(row.workerIp);
    const assignedPort = row.assignedPort;
    if (
      !row.workerId ||
      !parsedIp.success ||
      assignedPort === null ||
      !Number.isInteger(assignedPort) ||
      assignedPort < 1 ||
      assignedPort > 65535
    ) {
      console.warn(
        `[GatewayReconciliation] Excluding ineligible route for deployment ${row.deploymentId}`
      );
      continue;
    }

    routes.push({
      deploymentId: row.deploymentId,
      upstreamIp: parsedIp.data,
      upstreamPort: assignedPort,
      healthPath: '/',
      workerId: row.workerId,
      attemptId: row.attemptId,
    });
  }

  return routes;
}

function isReadyPublishedRoute(route: PublishedRoute): boolean {
  if (route.status !== 'ready' || !route.publicUrl) return false;
  try {
    const url = new URL(route.publicUrl);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Reconciles Caddy/Quick Tunnel routes from authoritative database state.
 *
 * A gateway request failure leaves deployment routing state untouched because
 * the gateway may still be serving the previous route. Once a reconciliation
 * succeeds, URL/status updates are guarded by the worker assignment and port
 * captured before the request, so a delayed response cannot overwrite a newer
 * deployment attempt.
 */
export async function reconcileGatewayRoutes(
  now: Date = new Date()
): Promise<GatewayReconciliationResult> {
  let desired: AuthoritativeRoute[];
  try {
    desired = await loadAuthoritativeGatewayRoutes(now);
  } catch (error) {
    console.warn(
      '[GatewayReconciliation] Authoritative deployment state unavailable; leaving gateway untouched:',
      error instanceof Error ? error.message : String(error)
    );
    return { status: 'unavailable', desiredRoutes: 0, publishedRoutes: 0, updatedDeployments: 0 };
  }

  const published = await gatewayClient.reconcileRoutes(
    desired.map(({ deploymentId, attemptId, upstreamIp, upstreamPort, healthPath }) => ({
      deploymentId,
      attemptId: attemptId ?? undefined,
      upstreamIp,
      upstreamPort,
      healthPath,
    }))
  );

  // A transient gateway outage is retried by the client. Do not turn a
  // temporary control-plane-to-gateway failure into destructive DB updates.
  if (!published) {
    return {
      status: 'unavailable',
      desiredRoutes: desired.length,
      publishedRoutes: 0,
      updatedDeployments: 0,
    };
  }

  const publishedById = new Map(published.map((route) => [route.deploymentId, route]));
  let updatedDeployments = 0;

  for (const route of desired) {
    const gatewayRoute = publishedById.get(route.deploymentId);
    const routeIsCurrent =
      gatewayRoute &&
      gatewayRoute.upstreamIp === route.upstreamIp &&
      gatewayRoute.upstreamPort === route.upstreamPort;
    const ready = Boolean(routeIsCurrent && gatewayRoute && isReadyPublishedRoute(gatewayRoute));
    const guard = [
      eq(deployments.id, route.deploymentId),
      eq(deployments.state, 'running'),
      eq(deployments.workerId, route.workerId),
      eq(deployments.assignedPort, route.upstreamPort),
    ];
    if (route.attemptId) guard.push(eq(deployments.attemptId, route.attemptId));

    const updated = await db
      .update(deployments)
      .set({
        publicUrl: ready ? gatewayRoute?.publicUrl ?? null : null,
        routingStatus: ready ? 'ready' : 'failed',
        routingError: ready
          ? null
          : 'Gateway did not restore a healthy public route for this deployment',
        updatedAt: new Date(),
      })
      .where(and(...guard))
      .returning({ id: deployments.id });
    updatedDeployments += updated.length;
  }

  // A successful authoritative empty set intentionally removes stale gateway
  // routes. There are no deployment rows to update in that case.
  return {
    status: 'reconciled',
    desiredRoutes: desired.length,
    publishedRoutes: published.length,
    updatedDeployments,
  };
}
