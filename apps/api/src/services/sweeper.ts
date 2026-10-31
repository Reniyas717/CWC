import { eq, and, or, lt, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { workerNodes, deployments, deploymentEvents } from '../db/schema.js';
import { removeWorkerFromCache } from '../cache/redis.js';

export interface SweepResult {
  offlineWorkers: string[];
  rescheduledDeployments: string[];
  failedDeployments: string[];
  timestamp: string;
}

// Heartbeat threshold: 30 seconds (matches ARCHITECTURE.md)
export const HEARTBEAT_TIMEOUT_MS = 30_000;

// Periodic sweep interval: 10 seconds
export const SWEEPER_INTERVAL_MS = 10_000;

// Maximum redeployment attempts before marking deployment as failed
export const MAX_RETRY_COUNT = 3;

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
    failedDeployments: [],
    timestamp: now.toISOString(),
  };

  try {
    // 1. Find workers that timed out (not already offline or draining)
    const timedOutWorkers = await db
      .select()
      .from(workerNodes)
      .where(
        and(
          or(eq(workerNodes.state, 'idle'), eq(workerNodes.state, 'busy'), eq(workerNodes.state, 'error')),
          lt(workerNodes.lastHeartbeatAt, cutoff)
        )
      );

    if (timedOutWorkers.length === 0) {
      return result;
    }

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
          // Deployment was queued specifically for this dead worker; unassign worker so any healthy node can pick it up
          await db
            .update(deployments)
            .set({
              workerId: null,
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

        if (nextRetry <= MAX_RETRY_COUNT) {
          // Auto-reschedule to 'queued' for placement on another worker
          await db
            .update(deployments)
            .set({
              state: 'queued',
              workerId: null,
              containerId: null,
              assignedPort: null,
              publicUrl: null,
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
        } else {
          // Exceeded retry count - mark failed
          await db
            .update(deployments)
            .set({
              state: 'failed',
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
        }
      }
    }
  } catch (error) {
    console.error('[Sweeper] Error during worker health sweep:', error);
  }

  return result;
}

let sweeperIntervalId: NodeJS.Timeout | null = null;

/**
 * Starts the periodic background sweeper.
 */
export function startSweeper(intervalMs: number = SWEEPER_INTERVAL_MS): void {
  if (sweeperIntervalId) {
    return;
  }

  console.log(`[Sweeper] Starting heartbeat sweeper (interval: ${intervalMs / 1000}s, timeout: ${HEARTBEAT_TIMEOUT_MS / 1000}s)`);

  sweeperIntervalId = setInterval(async () => {
    try {
      await sweepWorkerHealth();
    } catch (err) {
      console.error('[Sweeper] Background tick execution error:', err);
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
    console.log('[Sweeper] Heartbeat sweeper stopped.');
  }
}
