import { Router, Request, Response } from 'express';
import { eq, and, or, asc, isNull, count, inArray, lt } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import {
  WorkerRegistrationSchema,
  WorkerHeartbeatSchema,
  WorkerNode,
  WorkerStatusResponse,
  DeploymentTaskPayload,
} from '@cloud-without-clouds/shared';
import { z } from 'zod';
import { requireWorker, optionalAdmin } from '../middlewares/auth.js';
import { db, isDatabaseAvailable } from '../db/index.js';
import { workerNodes, deployments, applications } from '../db/schema.js';
import { memoryStore } from '../db/memory-store.js';
import { recordWorkerHeartbeatInCache, removeWorkerFromCache } from '../cache/redis.js';
import { sweepWorkerHealth } from '../services/sweeper.js';
import { removeDeploymentRoute } from '../services/route-cleanup.js';
import { reconcileMissingRunningDeployments } from '../services/heartbeat-reconciliation.js';
import {
  evaluateWorkerEligibility,
  getWorkerLoadScores,
  schedulePendingDeployments,
  rebalanceClusterWorkloads,
} from '../services/scheduler.js';

export const workersRouter: Router = Router();

/**
 * Maps a database row from `worker_nodes` to the canonical `WorkerNode` interface.
 */
function mapWorkerRowToNode(row: typeof workerNodes.$inferSelect): WorkerNode {
  const isHeartbeatExpired =
    Date.now() - new Date(row.lastHeartbeatAt).getTime() > 30_000;
  const effectiveState =
    row.state !== 'draining' && isHeartbeatExpired ? 'offline' : row.state;

  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    ipAddress: row.ipAddress,
    port: row.port,
    state: effectiveState,
    resources: {
      cpuCount: row.cpuCores,
      cpuUsagePercent: row.cpuUsagePercent,
      totalMemoryMb: row.totalMemoryMb,
      freeMemoryMb: row.freeMemoryMb,
      usedMemoryMb: row.usedMemoryMb,
      activeContainers: effectiveState === 'offline' ? 0 : row.activeContainers,
    },
    limits: {
      maxConcurrentWorkloads: row.maxConcurrentWorkloads,
      maxMemoryMb: 4096,
      maxCpuCores: 2,
    },
    version: row.version,
    registeredAt: row.registeredAt.toISOString(),
    lastHeartbeatAt: row.lastHeartbeatAt.toISOString(),
  };
}

/**
 * GET /api/v1/workers
 * Lists all registered worker nodes. Open in dev mode, guarded by optionalAdmin.
 * Supports optional pagination via ?page=1&limit=10.
 */
workersRouter.get('/', optionalAdmin, async (req: Request, res: Response) => {
  const { page, limit } = req.query;
  const pageNum = page ? Math.max(1, parseInt(String(page), 10) || 1) : undefined;
  const limitNum = limit ? Math.max(1, parseInt(String(limit), 10) || 10) : undefined;

  const sendResponse = (data: WorkerNode[], msg: string) => {
    const totalCount = data.length;
    if (pageNum !== undefined && limitNum !== undefined) {
      const start = (pageNum - 1) * limitNum;
      const pagedData = data.slice(start, start + limitNum);
      return res.status(200).json({
        success: true,
        data: pagedData,
        count: pagedData.length,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalCount,
          totalPages: Math.max(1, Math.ceil(totalCount / limitNum)),
        },
        message: msg,
      });
    }

    return res.status(200).json({
      success: true,
      data,
      count: totalCount,
      message: msg,
    });
  };

  if (!isDatabaseAvailable()) {
    const data = memoryStore.getWorkers();
    return sendResponse(data, 'Worker nodes retrieved successfully (dev in-memory mode)');
  }

  try {
    const rows = await db.select().from(workerNodes);
    const data: WorkerNode[] = rows.map(mapWorkerRowToNode);
    return sendResponse(data, 'Worker nodes retrieved successfully');
  } catch (error) {
    const data = memoryStore.getWorkers();
    return sendResponse(data, 'Worker nodes retrieved from dev fallback mode');
  }
});

/**
 * GET /api/v1/workers/scores
 * Returns load scores and resource eligibility breakdowns for all registered worker nodes.
 * Accepts optional query parameter ?memoryMb=512. Guarded by optionalAdmin.
 */
workersRouter.get('/scores', optionalAdmin, async (req: Request, res: Response) => {
  const memoryMb = req.query.memoryMb ? Number(req.query.memoryMb) : 512;
  const targetMb = isNaN(memoryMb) ? 512 : memoryMb;

  if (!isDatabaseAvailable()) {
    const data = memoryStore.getWorkerScores(targetMb);
    res.status(200).json({
      success: true,
      count: data.length,
      data,
      message: 'Worker load scores retrieved successfully (dev in-memory mode)',
    });
    return;
  }

  try {
    const data = await getWorkerLoadScores(targetMb);
    res.status(200).json({
      success: true,
      count: data.length,
      data,
      message: 'Worker load scores retrieved successfully',
    });
  } catch (error) {
    const data = memoryStore.getWorkerScores(targetMb);
    res.status(200).json({
      success: true,
      count: data.length,
      data,
      message: 'Worker load scores calculated from dev fallback mode',
    });
  }
});

/**
 * GET /api/v1/workers/:id
 * Retrieves detailed info for a single worker node by ID.
 */
workersRouter.get('/:id', optionalAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rows = await db.select().from(workerNodes).where(eq(workerNodes.id, id));

    if (rows.length === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Worker node '${id}' not found`,
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: mapWorkerRowToNode(rows[0]),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve worker node',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * POST /api/v1/workers/sweep
 * Triggers a worker health check and failure recovery sweep across all registered nodes.
 * Guarded by optionalAdmin.
 */
workersRouter.post('/sweep', optionalAdmin, async (_req: Request, res: Response) => {
  if (!isDatabaseAvailable()) {
    res.status(200).json({
      success: true,
      data: {
        offlineWorkers: [],
        rescheduledDeployments: [],
        scheduledDeployments: [],
        awaitingCapacityDeployments: [],
        failedDeployments: [],
        timestamp: new Date().toISOString(),
      },
      message: 'Worker health sweep executed (dev in-memory mode)',
    });
    return;
  }

  try {
    const result = await sweepWorkerHealth();
    res.status(200).json({
      success: true,
      data: result,
      message: 'Worker health sweep executed successfully',
    });
  } catch (error) {
    res.status(200).json({
      success: true,
      data: {
        offlineWorkers: [],
        rescheduledDeployments: [],
        scheduledDeployments: [],
        awaitingCapacityDeployments: [],
        failedDeployments: [],
        timestamp: new Date().toISOString(),
      },
      message: 'Worker health sweep completed in fallback mode',
    });
  }
});

/**
 * POST /api/v1/workers/rebalance
 * Capacity-weighted cluster load equalizer.
 * Proportional to worker hardware: a 16 GB node and a 2 GB node are balanced when
 * their allocation ratios (allocated / total) are approximately equal.
 * Query / Body parameters:
 *   dryRun: boolean (if true, calculates the migration plan without executing)
 */
workersRouter.post('/rebalance', optionalAdmin, async (req: Request, res: Response) => {
  const dryRun = req.body?.dryRun === true || req.query?.dryRun === 'true';
  const strategy = req.body?.strategy || 'balanced';

  if (!isDatabaseAvailable()) {
    const result = memoryStore.rebalance(strategy, dryRun);
    res.status(200).json({
      success: true,
      data: result,
      message: dryRun
        ? 'Rebalance plan computed successfully (dev in-memory mode)'
        : 'Cluster load equalized successfully (dev in-memory mode)',
    });
    return;
  }

  try {
    const result = await rebalanceClusterWorkloads({ dryRun });
    res.status(200).json({
      success: true,
      data: result,
      message: dryRun
        ? 'Rebalance plan computed successfully'
        : 'Cluster load equalized successfully',
    });
  } catch (error) {
    const result = memoryStore.rebalance(strategy, dryRun);
    res.status(200).json({
      success: true,
      data: result,
      message: dryRun
        ? 'Rebalance plan computed from fallback mode'
        : 'Cluster load equalized in fallback mode',
    });
  }
});

/**
 * POST /api/v1/workers/register
 * Registers a new worker node with its hardware capabilities and networking info.
 */
workersRouter.post('/register', requireWorker, async (req: Request, res: Response) => {
  const parseResult = WorkerRegistrationSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid worker registration payload',
        details: parseResult.error.flatten(),
      },
    });
    return;
  }

  const payload = parseResult.data;

  const now = new Date();

  try {
    // Upsert into PostgreSQL
    await db
      .insert(workerNodes)
      .values({
        id: payload.id,
        name: payload.name,
        hostname: payload.hostname,
        ipAddress: payload.ipAddress,
        port: payload.port,
        state: 'idle',
        cpuCores: payload.resources.cpuCount,
        cpuUsagePercent: payload.resources.cpuUsagePercent,
        totalMemoryMb: payload.resources.totalMemoryMb,
        freeMemoryMb: payload.resources.freeMemoryMb,
        usedMemoryMb: payload.resources.usedMemoryMb,
        maxConcurrentWorkloads: payload.limits.maxConcurrentWorkloads,
        activeContainers: payload.resources.activeContainers,
        version: payload.version,
        registeredAt: now,
        lastHeartbeatAt: now,
      })
      .onConflictDoUpdate({
        target: workerNodes.id,
        set: {
          name: payload.name,
          hostname: payload.hostname,
          ipAddress: payload.ipAddress,
          port: payload.port,
          state: 'idle',
          cpuCores: payload.resources.cpuCount,
          cpuUsagePercent: payload.resources.cpuUsagePercent,
          totalMemoryMb: payload.resources.totalMemoryMb,
          freeMemoryMb: payload.resources.freeMemoryMb,
          usedMemoryMb: payload.resources.usedMemoryMb,
          maxConcurrentWorkloads: payload.limits.maxConcurrentWorkloads,
          activeContainers: payload.resources.activeContainers,
          version: payload.version,
          lastHeartbeatAt: now,
        },
      });

    // Record worker active lease in Redis (35-second TTL)
    await recordWorkerHeartbeatInCache(payload.id, now.toISOString()).catch((err) => {
      console.warn('[Workers] Redis heartbeat cache warning:', err.message);
    });

    const rows = await db.select().from(workerNodes).where(eq(workerNodes.id, payload.id));
    const registeredNode = rows.length > 0 ? mapWorkerRowToNode(rows[0]) : undefined;

    const response: WorkerStatusResponse = {
      success: true,
      acknowledged: true,
      worker: registeredNode,
      timestamp: now.toISOString(),
    };

    // Re-evaluate pending unassigned deployments in background
    schedulePendingDeployments().catch((err) => {
      console.warn('[Scheduler] Error scheduling pending deployments on worker register:', err);
    });

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REGISTRATION_FAILED',
        message: 'Failed to persist worker registration',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * POST /api/v1/workers/heartbeat
 * Periodic telemetry update from active workers (CPU, memory, active workloads).
 */
workersRouter.post('/heartbeat', requireWorker, async (req: Request, res: Response) => {
  const parseResult = WorkerHeartbeatSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid worker heartbeat payload',
        details: parseResult.error.flatten(),
      },
    });
    return;
  }

  const payload = parseResult.data;
  const now = new Date();

  try {
    // Check if worker exists
    const existing = await db
      .select({ id: workerNodes.id })
      .from(workerNodes)
      .where(eq(workerNodes.id, payload.workerId));

    if (existing.length === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'WORKER_NOT_REGISTERED',
          message: `Worker '${payload.workerId}' is not registered. Please register first.`,
        },
      });
      return;
    }

    // Update telemetry in PostgreSQL
    await db
      .update(workerNodes)
      .set({
        state: payload.state,
        cpuUsagePercent: payload.resources.cpuUsagePercent,
        freeMemoryMb: payload.resources.freeMemoryMb,
        usedMemoryMb: payload.resources.usedMemoryMb,
        activeContainers: payload.resources.activeContainers,
        lastHeartbeatAt: now,
      })
      .where(eq(workerNodes.id, payload.workerId));

    // Refresh 35s heartbeat lease in Redis
    await recordWorkerHeartbeatInCache(payload.workerId, payload.timestamp).catch((err) => {
      console.warn('[Workers] Redis heartbeat cache warning:', err.message);
    });

    // A worker restart clears its in-memory active workload set. Once a
    // running deployment is older than the reconciliation grace period and
    // absent from a valid heartbeat, mark it failed and remove its guarded
    // public route. Newly claimed/running work is intentionally ignored by
    // the helper to avoid false positives during heartbeat/claim races.
    const missingRunningDeployments = await reconcileMissingRunningDeployments({
      workerId: payload.workerId,
      activeWorkloadIds: payload.activeWorkloadIds,
      now,
    });
    for (const deployment of missingRunningDeployments) {
      void removeDeploymentRoute({
        deploymentId: deployment.deploymentId,
        gatewayAttemptId: deployment.attemptId ?? undefined,
        currentAttemptId: deployment.attemptId,
        expectedState: 'failed',
      }).catch((cleanupError: unknown) => {
        console.warn(
          `[Workers] Heartbeat route cleanup failed for ${deployment.deploymentId}:`,
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        );
      });
    }

    const response: WorkerStatusResponse = {
      success: true,
      acknowledged: true,
      timestamp: now.toISOString(),
    };

    // Re-evaluate pending unassigned deployments in background
    schedulePendingDeployments().catch((err) => {
      console.warn('[Scheduler] Error scheduling pending deployments on worker heartbeat:', err);
    });

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'HEARTBEAT_FAILED',
        message: 'Failed to process worker heartbeat',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

const WorkerStatusUpdateSchema = z.object({
  workerId: z.string().min(1),
  state: z.enum(['idle', 'busy', 'draining', 'offline', 'error']),
  details: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});

/**
 * POST /api/v1/workers/status
 * Explicit state transition notification (e.g. graceful drain or shutdown).
 */
workersRouter.post('/status', requireWorker, async (req: Request, res: Response) => {
  const parseResult = WorkerStatusUpdateSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid worker status update payload',
        details: parseResult.error.flatten(),
      },
    });
    return;
  }

  const { workerId, state } = parseResult.data;
  const now = new Date();

  try {
    await db
      .update(workerNodes)
      .set({
        state,
        lastHeartbeatAt: now,
      })
      .where(eq(workerNodes.id, workerId));

    // If node went offline or drained, clear active lease from Redis
    if (state === 'offline' || state === 'draining') {
      await removeWorkerFromCache(workerId).catch(() => {});
    }

    res.status(200).json({
      success: true,
      acknowledged: true,
      workerId,
      state,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'STATUS_UPDATE_FAILED',
        message: 'Failed to update worker status',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * GET /api/v1/workers/:id/tasks
 * Worker task polling endpoint (MVP pull-based task dispatch).
 */
workersRouter.get('/:id/tasks', requireWorker, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Verify worker is registered
    const existingWorker = await db.select().from(workerNodes).where(eq(workerNodes.id, id));

    if (existingWorker.length === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'WORKER_NOT_REGISTERED',
          message: `Worker node '${id}' not registered. Please register first.`,
        },
      });
      return;
    }

    // Deliver cancellation cleanup through a short lease. A cancelled row must
    // not be returned forever after a worker has acknowledged cleanup, while a
    // crashed worker gets another chance after the lease expires.
    const cancellationRetryBefore = new Date(Date.now() - 30_000);
    const pendingCancellation = await db
      .select()
      .from(deployments)
      .where(
        and(
          eq(deployments.workerId, id),
          eq(deployments.state, 'cancelled'),
          isNull(deployments.cancelAcknowledgedAt),
          or(
            isNull(deployments.cancelDispatchedAt),
            lt(deployments.cancelDispatchedAt, cancellationRetryBefore)
          )
        )
      )
      .limit(1);

    if (pendingCancellation.length > 0) {
      const deployment = pendingCancellation[0];
      const dispatchedAt = new Date();
      const claimedCancellation = await db
        .update(deployments)
        .set({ cancelDispatchedAt: dispatchedAt, updatedAt: dispatchedAt })
        .where(
          and(
            eq(deployments.id, deployment.id),
            eq(deployments.workerId, id),
            eq(deployments.state, 'cancelled'),
            isNull(deployments.cancelAcknowledgedAt),
            or(
              isNull(deployments.cancelDispatchedAt),
              lt(deployments.cancelDispatchedAt, cancellationRetryBefore)
            )
          )
        )
        .returning({ id: deployments.id });

      if (claimedCancellation.length === 0) {
        res.status(200).json({ success: true, hasTask: false });
        return;
      }

      res.status(200).json({
        success: true,
        hasTask: false,
        action: 'cancel',
        deploymentId: deployment.id,
      });
      return;
    }

    /**
     * Claim inside one transaction. The worker row serializes claims made by
     * concurrent polls from this worker, while SKIP LOCKED prevents two
     * workers from selecting the same queued deployment. The eligibility
     * check runs after the worker row is locked, so the capacity decision and
     * the state transition observe one consistent snapshot.
     */
    const claimedTask = await db.transaction(async (tx) => {
      const lockedWorkers = await tx
        .select()
        .from(workerNodes)
        .where(eq(workerNodes.id, id))
        .for('update');
      const worker = lockedWorkers[0];

      if (!worker) {
        return { kind: 'missing-worker' as const };
      }

      // A build/deploy reservation is not reflected in activeContainers until
      // the worker reports running. Count those reservations while deciding
      // whether another task can be claimed.
      const reservedRows = await tx
        .select({ value: count() })
        .from(deployments)
        .where(
          and(
            eq(deployments.workerId, id),
            inArray(deployments.state, ['building', 'deploying'])
          )
        );
      const reservedDeployments = Number(reservedRows[0]?.value ?? 0);
      const workerForEligibility = {
        ...worker,
        activeContainers: worker.activeContainers + reservedDeployments,
      };

      // Lock one candidate row. An unassigned row can be selected by another
      // worker, so SKIP LOCKED is essential for concurrent worker polling.
      const pendingDeployments = await tx
        .select()
        .from(deployments)
        .where(
          and(
            eq(deployments.state, 'queued'),
            isNull(deployments.routingError),
            or(eq(deployments.workerId, id), isNull(deployments.workerId))
          )
        )
        .orderBy(asc(deployments.createdAt))
        .limit(1)
        .for('update', { skipLocked: true });

      const dep = pendingDeployments[0];
      if (!dep) {
        return { kind: 'empty' as const };
      }

      const appRows = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, dep.applicationId));
      const app = appRows[0];
      if (!app) {
        return { kind: 'empty' as const };
      }

      const eligibility = evaluateWorkerEligibility(workerForEligibility, app.memoryLimitMb);
      if (!eligibility.eligible) {
        return {
          kind: 'ineligible' as const,
          reasons: eligibility.rejectionReasons,
        };
      }

      const now = new Date();
      const attemptId = randomUUID();
      const updatedDeployments = await tx
        .update(deployments)
        .set({
          workerId: id,
          attemptId,
          state: 'building',
          updatedAt: now,
        })
        .where(
          and(
            eq(deployments.id, dep.id),
            eq(deployments.state, 'queued'),
            or(eq(deployments.workerId, id), isNull(deployments.workerId))
          )
        )
        .returning();

      if (updatedDeployments.length === 0) {
        return { kind: 'empty' as const };
      }

      return {
        kind: 'claimed' as const,
        deployment: updatedDeployments[0],
        app,
      };
    });

    if (claimedTask.kind === 'missing-worker') {
      res.status(404).json({
        success: false,
        error: {
          code: 'WORKER_NOT_REGISTERED',
          message: `Worker node '${id}' is not registered. Please register first.`,
        },
      });
      return;
    }

    if (claimedTask.kind === 'ineligible') {
      res.status(200).json({
        success: true,
        hasTask: false,
        reason: 'WORKER_INELIGIBLE',
        details: claimedTask.reasons,
      });
      return;
    }

    if (claimedTask.kind === 'empty') {
      res.status(200).json({
        success: true,
        hasTask: false,
      });
      return;
    }

    const dep = claimedTask.deployment;
    const app = claimedTask.app;

    const taskPayload: DeploymentTaskPayload = {
      deploymentId: dep.id,
      attemptId: dep.attemptId ?? undefined,
      applicationId: app.id,
      git: {
        repositoryUrl: app.repositoryUrl,
        branch: dep.gitBranch || app.gitBranch,
        rootDirectory: app.rootDirectory || '/',
        commitHash: dep.gitCommitHash || undefined,
      },
      dockerfilePath: 'Dockerfile',
      buildContext:
        app.rootDirectory && app.rootDirectory !== '/'
          ? app.rootDirectory.replace(/^\/+/, '')
          : '.',
      targetPort: app.targetPort,
      replicas: 1,
      resourceLimits: {
        cpuLimitCores: app.cpuLimitCores,
        memoryLimitMb: app.memoryLimitMb,
      },
      env: (app.envVars as Array<{ key: string; value: string; isSecret: boolean }>) || [],
    };

    res.status(200).json({
      success: true,
      hasTask: true,
      task: taskPayload,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'TASK_POLL_FAILED',
        message: 'Failed to poll deployment tasks',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * POST /api/v1/workers/:id/simulate-dropout
 * Simulates a worker laptop abruptly dropping offline / losing connectivity (hackathon chaos demo).
 * Rewinds lastHeartbeatAt beyond the 30-second lease threshold and triggers an immediate health sweep.
 */
workersRouter.post('/:id/simulate-dropout', optionalAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const expiredTimestamp = new Date(Date.now() - 45_000); // 45s ago (>30s lease)
    await db
      .update(workerNodes)
      .set({
        lastHeartbeatAt: expiredTimestamp,
      })
      .where(eq(workerNodes.id, id));

    // Clear active lease from Redis
    await removeWorkerFromCache(id).catch(() => {});

    // Run health sweeper immediately to declare node offline and reschedule active workloads
    const sweepResult = await sweepWorkerHealth();

    res.status(200).json({
      success: true,
      simulated: true,
      workerId: id,
      state: 'offline',
      message: `Simulated dropout for worker '${id}'. Heartbeat expired and failure recovery sweep executed.`,
      sweep: sweepResult,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SIMULATE_DROPOUT_FAILED',
        message: `Failed to simulate dropout for worker '${id}'`,
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * POST /api/v1/workers/:id/simulate-reconnect
 * Restores an offline worker node back to healthy 'idle' state.
 */
workersRouter.post('/:id/simulate-reconnect', optionalAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const now = new Date();
    await db
      .update(workerNodes)
      .set({
        state: 'idle',
        lastHeartbeatAt: now,
      })
      .where(eq(workerNodes.id, id));

    await recordWorkerHeartbeatInCache(id, now.toISOString()).catch(() => {});

    // Re-evaluate any pending deployments that could be scheduled on this reconnected worker
    schedulePendingDeployments().catch(() => {});

    res.status(200).json({
      success: true,
      simulated: true,
      workerId: id,
      state: 'idle',
      message: `Worker '${id}' reconnected to cluster and is ready for workloads.`,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SIMULATE_RECONNECT_FAILED',
        message: `Failed to reconnect worker '${id}'`,
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});
