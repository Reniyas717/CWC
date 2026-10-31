import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import {
  WorkerRegistrationSchema,
  WorkerHeartbeatSchema,
  WorkerNode,
  WorkerStatusResponse,
} from '@cloud-without-clouds/shared';
import { z } from 'zod';
import { requireWorker, optionalAdmin } from '../middlewares/auth.js';
import { db } from '../db/index.js';
import { workerNodes } from '../db/schema.js';
import {
  recordWorkerHeartbeatInCache,
  removeWorkerFromCache,
} from '../cache/redis.js';

export const workersRouter: Router = Router();

/**
 * Maps a database row from `worker_nodes` to the canonical `WorkerNode` interface.
 */
function mapWorkerRowToNode(row: typeof workerNodes.$inferSelect): WorkerNode {
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    ipAddress: row.ipAddress,
    port: row.port,
    state: row.state,
    resources: {
      cpuCount: row.cpuCores,
      cpuUsagePercent: row.cpuUsagePercent,
      totalMemoryMb: row.totalMemoryMb,
      freeMemoryMb: row.freeMemoryMb,
      usedMemoryMb: row.usedMemoryMb,
      activeContainers: row.activeContainers,
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
 */
workersRouter.get('/', optionalAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(workerNodes);
    const data: WorkerNode[] = rows.map(mapWorkerRowToNode);

    res.status(200).json({
      success: true,
      data,
      count: data.length,
      message: 'Worker nodes retrieved successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve worker nodes',
        details: error instanceof Error ? error.message : String(error),
      },
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

  // Derive client IP address (prefer client-reported Tailscale or header forwarded)
  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    '127.0.0.1';

  const now = new Date();

  try {
    // Upsert into PostgreSQL
    await db
      .insert(workerNodes)
      .values({
        id: payload.id,
        name: payload.name,
        hostname: payload.hostname,
        ipAddress: clientIp,
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
          ipAddress: clientIp,
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

    const response: WorkerStatusResponse = {
      success: true,
      acknowledged: true,
      timestamp: now.toISOString(),
    };

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
 * Worker task polling endpoint (MVP dispatch mechanism).
 */
workersRouter.get('/:id/tasks', requireWorker, async (req: Request, res: Response) => {
  const { id } = req.params;

  // Phase 4 will dispatch actual deployment records from DB.
  // For Phase 3, we return valid 200 format confirming polling readiness.
  res.status(200).json({
    success: true,
    hasTask: false,
    workerId: id,
    message: 'Worker task polling active. No pending tasks.',
  });
});
