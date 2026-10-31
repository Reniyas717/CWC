import { Router, Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import {
  DeploymentResultPayloadSchema,
  DeploymentLogsPayloadSchema,
} from '@cloud-without-clouds/shared';
import { requireWorker } from '../middlewares/auth.js';
import { db } from '../db/index.js';
import { deployments, deploymentLogs, deploymentEvents, workerNodes } from '../db/schema.js';

export const internalDeploymentsRouter: Router = Router();

// All internal worker routes require WORKER_SECRET_TOKEN
internalDeploymentsRouter.use(requireWorker);

/**
 * POST /api/v1/internal/deployments/:id/result
 * Worker reports final or transition result of a deployment (e.g. running, failed, stopped).
 */
internalDeploymentsRouter.post('/:id/result', async (req: Request, res: Response) => {
  const { id } = req.params;
  const parseResult = DeploymentResultPayloadSchema.safeParse({
    ...req.body,
    deploymentId: req.body?.deploymentId || id,
  });

  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid deployment result payload',
        details: parseResult.error.flatten(),
      },
    });
    return;
  }

  const payload = parseResult.data;
  const now = new Date();

  try {
    const existing = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, id));

    if (existing.length === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Deployment '${id}' not found`,
        },
      });
      return;
    }

    const currentDep = existing[0];

    // Determine startedAt and finishedAt timestamps
    const startedAt =
      payload.state === 'running'
        ? currentDep.startedAt || now
        : currentDep.startedAt;
    const finishedAt =
      payload.state === 'failed' || payload.state === 'stopped'
        ? now
        : currentDep.finishedAt;

    // Update deployment state and runtime properties
    await db
      .update(deployments)
      .set({
        state: payload.state,
        containerId: payload.containerId ?? currentDep.containerId,
        assignedPort: payload.assignedPort ?? currentDep.assignedPort,
        publicUrl: payload.publicUrl ?? currentDep.publicUrl,
        gitCommitHash: payload.gitCommitHash ?? currentDep.gitCommitHash,
        errorMessage: payload.errorMessage ?? null,
        startedAt,
        finishedAt,
        updatedAt: now,
      })
      .where(eq(deployments.id, id));

    // Record discrete lifecycle event
    const eventType =
      payload.state === 'running'
        ? 'CONTAINER_START'
        : payload.state === 'failed'
          ? 'FAILED'
          : 'STOPPED';

    await db.insert(deploymentEvents).values({
      deploymentId: id,
      eventType,
      details: payload.errorMessage || `Container ${payload.state} on port ${payload.assignedPort || 'N/A'}`,
      timestamp: now,
    });

    // Update worker active containers count if running
    if (payload.state === 'running' && payload.workerId) {
      await db
        .update(workerNodes)
        .set({
          activeContainers: sql`active_containers + 1`,
          state: 'busy',
          lastHeartbeatAt: now,
        })
        .where(eq(workerNodes.id, payload.workerId));
    }

    res.status(200).json({
      success: true,
      acknowledged: true,
      deploymentId: id,
      state: payload.state,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_FAILED',
        message: 'Failed to record deployment result',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * POST /api/v1/internal/deployments/:id/logs
 * Worker flushes a batch of build and runtime logs for a deployment.
 */
internalDeploymentsRouter.post('/:id/logs', async (req: Request, res: Response) => {
  const { id } = req.params;
  const parseResult = DeploymentLogsPayloadSchema.safeParse({
    ...req.body,
    deploymentId: req.body?.deploymentId || id,
  });

  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid deployment logs payload',
        details: parseResult.error.flatten(),
      },
    });
    return;
  }

  const { logs } = parseResult.data;

  try {
    if (logs.length > 0) {
      await db.insert(deploymentLogs).values(
        logs.map((log) => ({
          deploymentId: id,
          stream: log.stream,
          level: log.level,
          message: log.message,
          timestamp: new Date(log.timestamp),
        }))
      );
    }

    res.status(200).json({
      success: true,
      acknowledged: true,
      count: logs.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'LOG_INSERT_FAILED',
        message: 'Failed to persist deployment logs',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});
