import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { deployments } from '../db/schema.js';
import { gatewayClient } from './gateway-client.js';

export interface RouteCleanupOptions {
  deploymentId: string;
  /** Attempt identity sent to the gateway for conditional deletion. */
  gatewayAttemptId?: string;
  /** Attempt identity that must still be present when recording cleanup status. */
  currentAttemptId?: string | null;
  expectedState: 'queued' | 'failed' | 'stopped' | 'cancelled';
}

/**
 * Remove a deployment route and record the result only on the same lifecycle
 * state/attempt that requested cleanup. The gateway-side attempt guard makes
 * this safe when a newer worker has already published a replacement route.
 */
export async function removeDeploymentRoute(options: RouteCleanupOptions): Promise<boolean> {
  const removed = await gatewayClient.removeRoute(options.deploymentId, options.gatewayAttemptId);
  const guard = [
    eq(deployments.id, options.deploymentId),
    eq(deployments.state, options.expectedState),
  ];
  if (options.currentAttemptId === null) {
    guard.push(isNull(deployments.attemptId));
  } else if (options.currentAttemptId) {
    guard.push(eq(deployments.attemptId, options.currentAttemptId));
  }

  await db
    .update(deployments)
    .set({
      publicUrl: null,
      routingStatus: 'failed',
      routingError: removed ? null : 'Gateway route removal failed; cleanup will be retried',
      updatedAt: new Date(),
    })
    .where(and(...guard));

  if (!removed) {
    console.warn(`[RouteCleanup] Route removal is pending for deployment ${options.deploymentId}`);
  }
  return removed;
}
