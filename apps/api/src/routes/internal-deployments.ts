import { Router, Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import {
  DeploymentResultPayloadSchema,
  DeploymentLogsPayloadSchema,
} from '@cloud-without-clouds/shared';
import { requireWorker } from '../middlewares/auth.js';
import { db } from '../db/index.js';
import { deployments, deploymentLogs, deploymentEvents, workerNodes } from '../db/schema.js';
import { gatewayClient } from '../services/gateway-client.js';

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
    const existing = await db.select().from(deployments).where(eq(deployments.id, id));

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

    // Guard against race conditions: if already cancelled, ignore stale running reports
    if (currentDep.state === 'cancelled' && payload.state === 'running') {
      res.status(200).json({
        success: true,
        acknowledged: true,
        deploymentId: id,
        state: 'cancelled',
      });
      return;
    }

    // Determine startedAt and finishedAt timestamps
    const startedAt =
      payload.state === 'running' ? currentDep.startedAt || now : currentDep.startedAt;
    const finishedAt =
      payload.state === 'failed' || payload.state === 'stopped' ? now : currentDep.finishedAt;

    // Initial publicUrl from worker payload or fallback
    const publicUrl = payload.publicUrl ?? currentDep.publicUrl;

    // Update deployment state and runtime properties immediately
    await db
      .update(deployments)
      .set({
        state: payload.state,
        containerId: payload.containerId ?? currentDep.containerId,
        assignedPort: payload.assignedPort ?? currentDep.assignedPort,
        publicUrl,
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
      details:
        payload.errorMessage ||
        `Container ${payload.state} on port ${payload.assignedPort || 'N/A'}`,
      timestamp: now,
    });

    // Update worker active containers count
    if (payload.state === 'running' && payload.workerId) {
      await db
        .update(workerNodes)
        .set({
          activeContainers: sql`active_containers + 1`,
          state: 'busy',
          lastHeartbeatAt: now,
        })
        .where(eq(workerNodes.id, payload.workerId));
    } else if (
      (payload.state === 'stopped' || payload.state === 'failed') &&
      currentDep.state === 'running'
    ) {
      const targetWorkerId = payload.workerId || currentDep.workerId;
      if (targetWorkerId) {
        await db
          .update(workerNodes)
          .set({
            activeContainers: sql`GREATEST(0, active_containers - 1)`,
            lastHeartbeatAt: now,
          })
          .where(eq(workerNodes.id, targetWorkerId));
      }
    }

    // Respond immediately to worker to avoid request timeouts
    res.status(200).json({
      success: true,
      acknowledged: true,
      deploymentId: id,
      state: payload.state,
    });

    // Publish or remove Gateway route asynchronously in background
    if (payload.state === 'running' && payload.assignedPort) {
      const targetWorkerId = payload.workerId || currentDep.workerId;
      void (async () => {
        try {
          let upstreamIp = '127.0.0.1';
          if (targetWorkerId) {
            const workerRow = await db
              .select()
              .from(workerNodes)
              .where(eq(workerNodes.id, targetWorkerId));
            if (workerRow.length > 0 && workerRow[0].ipAddress) {
              upstreamIp = workerRow[0].ipAddress;
            }
          }

          const published = await gatewayClient.publishRoute(
            id,
            upstreamIp,
            payload.assignedPort!,
            '/'
          );

          if (published?.publicUrl) {
            await db
              .update(deployments)
              .set({
                publicUrl: published.publicUrl,
                updatedAt: new Date(),
              })
              .where(eq(deployments.id, id));
          }
        } catch (gwErr) {
          console.warn(`[InternalDeployments] Gateway route publication error for ${id}:`, gwErr);
        }
      })();
    } else if (payload.state === 'stopped' || payload.state === 'failed') {
      void gatewayClient.removeRoute(id);
    }
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
