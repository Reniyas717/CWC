import { eq, and, or, lt, inArray, isNotNull } from 'drizzle-orm';
import { db, isDatabaseAvailable } from '../db/index.js';
import { workerNodes, deployments, deploymentEvents } from '../db/schema.js';
import { removeWorkerFromCache } from '../cache/redis.js';
import { removeDeploymentRoute } from './route-cleanup.js';
import { reconcileGatewayRoutes } from './gateway-reconciliation.js';

export interface SweepResult {
  offlineWorkers: string[];
  rescheduledDeployments: string[];
  scheduledDeployments: string[];
  awaitingCapacityDeployments: string[];
  failedDeployments: string[];
  timestamp: string;
}

// Heartbeat threshold: 30 seconds (matches ARCHITECTURE.md)
export const HEARTBEAT_TIMEOUT_MS = 30_000;

// Periodic sweep interval: 10 seconds
export const SWEEPER_INTERVAL_MS = 10_000;

// Maximum redeployment attempts before marking deployment as failed
export const MAX_RETRY_COUNT = 3;

type RouteCleanupTask = {
  deploymentId: string;
  promise: Promise<boolean>;
  releaseQueuedAssignment?: { workerId: string; attemptId: string };
};

/**
 * Scans all worker nodes in PostgreSQL.
 * If a worker has missed heartbeats for > 30 seconds (and is not already offline or draining):
 * 1. Transitions worker state to 'offline'
 * 2. Purges Redis heartbeat lease
 * 3. Identifies active in-flight deployments on that node
 * 4. Auto-reschedules in-flight deployments to 'queued' (or marks 'failed' if max retries exceeded)
 */
export async function sweepWorkerHealth(): Promise<SweepResult> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - HEARTBEAT_TIMEOUT_MS);

  const result: SweepResult = {
    offlineWorkers: [],
    rescheduledDeployments: [],
    scheduledDeployments: [],
    awaitingCapacityDeployments: [],
    failedDeployments: [],
    timestamp: now.toISOString(),
  };

  if (!isDatabaseAvailable()) {
    return result;
  }

  const routeCleanupTasks: RouteCleanupTask[] = [];

  try {
    // Terminal deployments whose last gateway cleanup failed remain visible
    // as retryable errors. Re-attempt them on every sweep; a missing gateway
    // route is treated as success by GatewayClient.
    const pendingRouteCleanup = await db
      .select({
        id: deployments.id,
        state: deployments.state,
        workerId: deployments.workerId,
        attemptId: deployments.attemptId,
      })
      .from(deployments)
      .where(
        and(
          inArray(deployments.state, ['queued', 'failed', 'stopped', 'cancelled']),
          isNotNull(deployments.routingError)
        )
      );
    for (const deployment of pendingRouteCleanup) {
      const expectedState =
        deployment.state === 'queued' ||
        deployment.state === 'failed' ||
        deployment.state === 'stopped' ||
        deployment.state === 'cancelled'
          ? deployment.state
          : null;
      if (!expectedState) continue;
      if (deployment.state === 'queued' && !deployment.attemptId) {
        // There is no safe attempt identity for a queued legacy row. Keep it
        // blocked rather than issuing an unguarded delete against a possible
        // newer route.
        continue;
      }
      const promise = removeDeploymentRoute({
        deploymentId: deployment.id,
        gatewayAttemptId: deployment.attemptId ?? undefined,
        currentAttemptId: deployment.attemptId ?? null,
        expectedState,
      }).catch((error: unknown) => {
        console.warn(
          `[Sweeper] Retry route cleanup failed for ${deployment.id}:`,
          error instanceof Error ? error.message : String(error)
        );
        return false;
      });
      routeCleanupTasks.push({
        deploymentId: deployment.id,
        promise,
        ...(deployment.state === 'queued' && deployment.attemptId && deployment.workerId
          ? {
              releaseQueuedAssignment: {
                workerId: deployment.workerId,
                attemptId: deployment.attemptId,
              },
            }
          : {}),
      });
    }

    // 1. Find workers that timed out (not already offline or draining)
    const timedOutWorkers = await db
      .select()
      .from(workerNodes)
      .where(
        and(
          or(
            eq(workerNodes.state, 'idle'),
            eq(workerNodes.state, 'busy'),
            eq(workerNodes.state, 'error')
          ),
          lt(workerNodes.lastHeartbeatAt, cutoff)
        )
      );

    for (const worker of timedOutWorkers) {
      result.offlineWorkers.push(worker.id);
      console.warn(
        `[Sweeper] Worker '${worker.id}' missed heartbeats (>30s, last: ${worker.lastHeartbeatAt.toISOString()}). Marking OFFLINE.`
      );

      // Transition worker to offline in PostgreSQL
      await db
        .update(workerNodes)
        .set({
          state: 'offline',
          activeContainers: 0,
        })
        .where(eq(workerNodes.id, worker.id));

      // Purge Redis lease cache
      await removeWorkerFromCache(worker.id).catch(() => {});

      // 2. Identify in-flight or assigned deployments for this worker
      const activeDeployments = await db
        .select()
        .from(deployments)
        .where(
          and(
            eq(deployments.workerId, worker.id),
            inArray(deployments.state, ['queued', 'building', 'deploying', 'running'])
          )
        );

      for (const dep of activeDeployments) {
        if (dep.state === 'queued') {
          if (dep.routingError) {
            // A queued deployment with a route cleanup error remains pinned
            // to the offline worker until the guarded retry above succeeds.
            result.awaitingCapacityDeployments.push(dep.id);
            continue;
          }
          // Deployment was queued specifically for this dead worker; unassign worker so any healthy node can pick it up
          await db
            .update(deployments)
            .set({
              workerId: null,
              attemptId: null,
              updatedAt: now,
            })
            .where(eq(deployments.id, dep.id));

          await db.insert(deploymentEvents).values({
            deploymentId: dep.id,
            eventType: 'RESCHEDULED',
            details: `Worker '${worker.id}' went offline while deployment was queued. Worker unassigned for re-evaluation.`,
            timestamp: now,
          });

          result.rescheduledDeployments.push(dep.id);
          continue;
        }

        // Deployment was actively building, deploying, or running on the dead worker
        const nextRetry = dep.retryCount + 1;
        const previousAttemptId = dep.attemptId ?? undefined;
        const routeNeedsCleanup =
          dep.routingStatus === 'ready' || dep.publicUrl !== null || dep.routingError !== null;
        const canGuardRouteCleanup = !routeNeedsCleanup || Boolean(previousAttemptId);

        if (nextRetry <= MAX_RETRY_COUNT) {
          // Auto-reschedule to 'queued' for placement on another worker
          await db
            .update(deployments)
            .set({
              state: 'queued',
              // Keep the offline assignment until its old route is removed.
              // This prevents another worker from claiming a deployment while
              // an obsolete tunnel is still serving traffic.
              workerId: routeNeedsCleanup ? worker.id : null,
              attemptId: routeNeedsCleanup ? (dep.attemptId ?? null) : null,
              containerId: null,
              assignedPort: null,
              publicUrl: null,
              workerUrl: null,
              routingStatus: 'pending',
              routingError: routeNeedsCleanup
                ? canGuardRouteCleanup
                  ? 'Gateway route cleanup pending before replacement'
                  : 'Gateway route cleanup requires an attempt identity'
                : null,
              retryCount: nextRetry,
              updatedAt: now,
            })
            .where(eq(deployments.id, dep.id));

          await db.insert(deploymentEvents).values({
            deploymentId: dep.id,
            eventType: 'RESCHEDULED',
            details: `Worker '${worker.id}' went offline. Deployment auto-rescheduled to queue (recovery attempt ${nextRetry}/${MAX_RETRY_COUNT}).`,
            timestamp: now,
          });

          console.log(
            `[Recovery] Deployment '${dep.id}' auto-rescheduled to queued (retry ${nextRetry}/${MAX_RETRY_COUNT}).`
          );
          result.rescheduledDeployments.push(dep.id);
          if (routeNeedsCleanup && canGuardRouteCleanup) {
            const promise = removeDeploymentRoute({
              deploymentId: dep.id,
              gatewayAttemptId: previousAttemptId,
              currentAttemptId: previousAttemptId ?? null,
              expectedState: 'queued',
            }).catch((error: unknown) => {
              console.warn(
                `[Sweeper] Route cleanup failed for rescheduled deployment ${dep.id}:`,
                error instanceof Error ? error.message : String(error)
              );
              return false;
            });
            routeCleanupTasks.push({
              deploymentId: dep.id,
              promise,
              ...(previousAttemptId
                ? { releaseQueuedAssignment: { workerId: worker.id, attemptId: previousAttemptId } }
                : {}),
            });
          } else if (routeNeedsCleanup) {
            routeCleanupTasks.push({
              deploymentId: dep.id,
              promise: Promise.resolve(false),
            });
          }
        } else {
          // Exceeded retry count - mark failed
          await db
            .update(deployments)
            .set({
              state: 'failed',
              attemptId: routeNeedsCleanup ? (dep.attemptId ?? null) : null,
              publicUrl: null,
              workerUrl: null,
              routingStatus: 'pending',
              routingError: routeNeedsCleanup
                ? canGuardRouteCleanup
                  ? 'Gateway route cleanup pending'
                  : 'Gateway route cleanup requires an attempt identity'
                : null,
              errorMessage: `Worker node '${worker.id}' went offline and maximum recovery retry limit (${MAX_RETRY_COUNT}) was exceeded.`,
              finishedAt: now,
              updatedAt: now,
            })
            .where(eq(deployments.id, dep.id));

          await db.insert(deploymentEvents).values({
            deploymentId: dep.id,
            eventType: 'FAILED',
            details: `Worker '${worker.id}' went offline. Maximum retry count (${MAX_RETRY_COUNT}) exceeded. Marked as failed.`,
            timestamp: now,
          });

          console.error(
            `[Recovery] Deployment '${dep.id}' marked FAILED: max retries (${MAX_RETRY_COUNT}) exceeded.`
          );
          result.failedDeployments.push(dep.id);
          if (routeNeedsCleanup && canGuardRouteCleanup) {
            const promise = removeDeploymentRoute({
              deploymentId: dep.id,
              gatewayAttemptId: previousAttemptId,
              currentAttemptId: previousAttemptId ?? null,
              expectedState: 'failed',
            }).catch((error: unknown) => {
              console.warn(
                `[Sweeper] Route cleanup failed for failed deployment ${dep.id}:`,
                error instanceof Error ? error.message : String(error)
              );
              return false;
            });
            routeCleanupTasks.push({ deploymentId: dep.id, promise });
          }
        }
      }
    }

    // Route cleanup is attempt-guarded, so it is safe to finish before a
    // replacement is assigned. This gives operators a deterministic recovery
    // boundary: the old route is either gone or marked for retry before the
    // next worker is allowed to claim the deployment.
    const cleanupResults = await Promise.all(
      routeCleanupTasks.map(async (task) => ({
        ...task,
        succeeded: await task.promise,
      }))
    );
    for (const task of cleanupResults) {
      if (task.succeeded && task.releaseQueuedAssignment) {
        await db
          .update(deployments)
          .set({ workerId: null, attemptId: null, routingError: null, updatedAt: now })
          .where(
            and(
              eq(deployments.id, task.deploymentId),
              eq(deployments.state, 'queued'),
              eq(deployments.workerId, task.releaseQueuedAssignment.workerId),
              eq(deployments.attemptId, task.releaseQueuedAssignment.attemptId)
            )
          );
      }
    }
    const blockedRecoveries = result.rescheduledDeployments.filter((id) =>
      cleanupResults.some((task) => task.deploymentId === id && !task.succeeded)
    );

    // Requeueing alone leaves the deployment stranded until a worker happens
    // to send another heartbeat. Re-evaluate placement now so any eligible
    // worker can claim the replacement during this same recovery sweep. Use a
    // dynamic import to keep the scheduler's heartbeat-constant dependency
    // from becoming a module-initialization cycle.
    if (blockedRecoveries.length === 0) {
      const { schedulePendingDeployments } = await import('./scheduler.js');
      await schedulePendingDeployments();
    }

    if (result.rescheduledDeployments.length > 0 && blockedRecoveries.length === 0) {
      const scheduled = await db
        .select({ id: deployments.id })
        .from(deployments)
        .where(
          and(
            inArray(deployments.id, result.rescheduledDeployments),
            eq(deployments.state, 'queued'),
            isNotNull(deployments.workerId)
          )
        );
      result.scheduledDeployments = scheduled.map(({ id }) => id);
      result.awaitingCapacityDeployments = result.rescheduledDeployments.filter(
        (id) => !result.scheduledDeployments.includes(id)
      );
    } else if (blockedRecoveries.length > 0) {
      result.scheduledDeployments = [];
      result.awaitingCapacityDeployments = result.rescheduledDeployments;
    }

    // 3. Stale in-flight deployment sweep (Build Timeout Recovery)
    // Any deployment in 'building' or 'deploying' for more than 5 minutes
    // has exceeded the build timeout and must be marked failed.
    const buildCutoff = new Date(now.getTime() - 5 * 60 * 1000);
    const staleInFlight = await db
      .select()
      .from(deployments)
      .where(
        and(
          inArray(deployments.state, ['building', 'deploying']),
          lt(deployments.updatedAt, buildCutoff)
        )
      );

    for (const dep of staleInFlight) {
      await db
        .update(deployments)
        .set({
          state: 'failed',
          errorMessage: 'Build timed out after 5 minutes; worker did not report completion',
          finishedAt: now,
          updatedAt: now,
        })
        .where(eq(deployments.id, dep.id));

      await db.insert(deploymentEvents).values({
        deploymentId: dep.id,
        eventType: 'FAILED',
        details: 'Build timed out after 5 minutes without completion report',
        timestamp: now,
      });

      console.warn(`[Sweeper] Marked stale building deployment '${dep.id}' as FAILED (timed out).`);
    }
  } catch (error) {
    console.error('[Sweeper] Error during worker health sweep:', error);
  }

  return result;
}

let sweeperIntervalId: NodeJS.Timeout | null = null;
let sweeperTickRunning = false;

/**
 * Starts the periodic background sweeper.
 */
export function startSweeper(intervalMs: number = SWEEPER_INTERVAL_MS): void {
  if (sweeperIntervalId) {
    return;
  }

  console.log(
    `[Sweeper] Starting heartbeat sweeper (interval: ${intervalMs / 1000}s, timeout: ${HEARTBEAT_TIMEOUT_MS / 1000}s)`
  );

  sweeperIntervalId = setInterval(async () => {
    if (sweeperTickRunning) return;
    sweeperTickRunning = true;
    try {
      await sweepWorkerHealth();
      // Reconcile on every tick so a gateway restart, tunnel URL replacement,
      // or transient publication failure converges without a new deploy.
      await reconcileGatewayRoutes();
    } catch (err) {
      console.error('[Sweeper] Background tick execution error:', err);
    } finally {
      sweeperTickRunning = false;
    }
  }, intervalMs);

  // Unref so that background timer does not block process exit during test suites
  if (sweeperIntervalId.unref) {
    sweeperIntervalId.unref();
  }
}

/**
 * Stops the periodic background sweeper.
 */
export function stopSweeper(): void {
  if (sweeperIntervalId) {
    clearInterval(sweeperIntervalId);
    sweeperIntervalId = null;
    sweeperTickRunning = false;
    console.log('[Sweeper] Heartbeat sweeper stopped.');
  }
}
