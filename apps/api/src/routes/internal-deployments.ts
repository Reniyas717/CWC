import { Router, Request, Response } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import {
  DeploymentResultPayloadSchema,
  DeploymentLogsPayloadSchema,
  TailscaleIpv4Schema,
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
    const outcome = await db.transaction(async (tx) => {
      const locked = await tx
        .select()
        .from(deployments)
        .where(eq(deployments.id, id))
        .for('update');
      const currentDep = locked[0];

      if (!currentDep) {
        return { kind: 'not-found' as const };
      }

      // A result is valid only for the worker and assignment currently stored
      // on the deployment. An absent attempt id is accepted only for legacy
      // rows that have not been claimed yet; claimed rows always require it.
      const ownsAttempt =
        payload.workerId === currentDep.workerId &&
        (currentDep.attemptId ? payload.attemptId === currentDep.attemptId : !payload.attemptId);
      if (!ownsAttempt || currentDep.state === 'cancelled') {
        return {
          kind: 'stale' as const,
          state: currentDep.state,
          attemptId: currentDep.attemptId,
        };
      }

      // Duplicate delivery is an acknowledgement, not a second lifecycle
      // transition. In particular it must not increment activeContainers twice.
      if (currentDep.state === payload.state) {
        return {
          kind: 'duplicate' as const,
          state: currentDep.state,
          workerId: currentDep.workerId,
          assignedPort: currentDep.assignedPort,
        };
      }

      // A terminal attempt cannot transition again. Same-state delivery was
      // handled above as an idempotent duplicate.
      if (currentDep.state === 'failed' || currentDep.state === 'stopped') {
        return {
          kind: 'stale' as const,
          state: currentDep.state,
          attemptId: currentDep.attemptId,
        };
      }

      const startedAt =
        payload.state === 'running' ? currentDep.startedAt || now : currentDep.startedAt;
      const finishedAt =
        payload.state === 'failed' || payload.state === 'stopped' ? now : currentDep.finishedAt;

      const updated = await tx
        .update(deployments)
        .set({
          state: payload.state,
          containerId: payload.containerId ?? currentDep.containerId,
          assignedPort: payload.assignedPort ?? currentDep.assignedPort,
          // Worker reports historically called this field publicUrl. It is
          // private and must never be returned as the platform URL.
          workerUrl: payload.workerUrl ?? payload.publicUrl ?? currentDep.workerUrl,
          publicUrl: payload.state === 'running' ? null : currentDep.publicUrl,
          routingStatus: payload.state === 'running' ? 'pending' : 'failed',
          routingError:
            payload.state === 'running'
              ? null
              : payload.errorMessage || `Container is ${payload.state}; public route removed`,
          gitCommitHash: payload.gitCommitHash ?? currentDep.gitCommitHash,
          errorMessage: payload.errorMessage ?? null,
          startedAt,
          finishedAt,
          updatedAt: now,
        })
        .where(eq(deployments.id, id))
        .returning();

      if (updated.length === 0) {
        return { kind: 'stale' as const, state: currentDep.state, attemptId: currentDep.attemptId };
      }

      const eventType =
        payload.state === 'running'
          ? 'CONTAINER_START'
          : payload.state === 'failed'
            ? 'FAILED'
            : 'STOPPED';
      await tx.insert(deploymentEvents).values({
        deploymentId: id,
        eventType,
        details:
          payload.errorMessage ||
          `Container ${payload.state} on port ${payload.assignedPort || 'N/A'}`,
        timestamp: now,
      });

      // Only the first running report reserves a container. Terminal reports
      // release that reservation once, even if they race with another report.
      if (payload.state === 'running' && currentDep.workerId) {
        await tx
          .update(workerNodes)
          .set({
            activeContainers: sql`active_containers + 1`,
            state: 'busy',
            lastHeartbeatAt: now,
          })
          .where(eq(workerNodes.id, currentDep.workerId));
      } else if (
        (payload.state === 'stopped' || payload.state === 'failed') &&
        currentDep.state === 'running' &&
        currentDep.workerId
      ) {
        await tx
          .update(workerNodes)
          .set({
            activeContainers: sql`GREATEST(0, active_containers - 1)`,
            lastHeartbeatAt: now,
          })
          .where(eq(workerNodes.id, currentDep.workerId));
      }

      return {
        kind: 'applied' as const,
        state: payload.state,
        workerId: currentDep.workerId,
        assignedPort: payload.assignedPort,
        attemptId: currentDep.attemptId,
      };
    });

    if (outcome.kind === 'not-found') {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Deployment '${id}' not found`,
        },
      });
      return;
    }

    if (outcome.kind === 'stale') {
      res.status(409).json({
        success: false,
        acknowledged: true,
        stale: true,
        deploymentId: id,
        state: outcome.state,
        error: {
          code: 'STALE_DEPLOYMENT_RESULT',
          message:
            'Deployment result belongs to an obsolete worker assignment or cancelled deployment',
        },
      });
      return;
    }

    if (outcome.kind === 'duplicate') {
      res.status(200).json({
        success: true,
        acknowledged: true,
        duplicate: true,
        deploymentId: id,
        state: outcome.state,
      });
      return;
    }

    // Respond immediately to worker to avoid request timeouts
    res.status(200).json({
      success: true,
      acknowledged: true,
      deploymentId: id,
      state: outcome.state,
    });

    // Publish or remove Gateway route asynchronously in background
    if (outcome.state === 'running' && outcome.assignedPort) {
      const targetWorkerId = outcome.workerId;
      void (async () => {
        try {
          if (!targetWorkerId) {
            throw new Error('Cannot publish gateway route without an assigned worker');
          }

          const workerRow = await db
            .select()
            .from(workerNodes)
            .where(eq(workerNodes.id, targetWorkerId));
          const upstreamIp = workerRow[0]
            ? TailscaleIpv4Schema.safeParse(workerRow[0].ipAddress)
            : { success: false as const };
          if (!upstreamIp.success) {
            throw new Error(`Worker ${targetWorkerId} has no valid Tailscale upstream address`);
          }

          const published = await gatewayClient.publishRoute(
            id,
            upstreamIp.data,
            outcome.assignedPort!,
            '/'
          );

          if (!published?.publicUrl) {
            throw new Error('Gateway did not return a public HTTPS URL');
          }

          // The worker may have been stopped or reassigned while the gateway
          // request was in flight. Only the same running attempt may publish.
          const guard = [eq(deployments.id, id), eq(deployments.state, 'running')];
          if (outcome.attemptId) {
            guard.push(eq(deployments.attemptId, outcome.attemptId));
          } else if (targetWorkerId) {
            guard.push(eq(deployments.workerId, targetWorkerId));
          }

          const applied = await db
            .update(deployments)
            .set({
              publicUrl: published.publicUrl,
              routingStatus: 'ready',
              routingError: null,
              updatedAt: new Date(),
            })
            .returning({ id: deployments.id })
            .where(and(...guard));

          // If the attempt became stale while the gateway call was in flight,
          // avoid leaving an orphaned route behind. Never remove a route for a
          // newer running attempt.
          if (applied.length === 0) {
            const current = await db
              .select({ state: deployments.state, workerId: deployments.workerId, attemptId: deployments.attemptId })
              .from(deployments)
              .where(eq(deployments.id, id));
            const currentRow = current[0];
            const replacedByNewAttempt =
              currentRow?.state === 'running' &&
              ((outcome.attemptId && currentRow.attemptId !== outcome.attemptId) ||
                (!outcome.attemptId && currentRow.workerId !== targetWorkerId));
            if (!replacedByNewAttempt) {
              await gatewayClient.removeRoute(id);
            }
          }
        } catch (gwErr) {
          const message = gwErr instanceof Error ? gwErr.message : String(gwErr);
          console.warn(`[InternalDeployments] Gateway route publication error for ${id}:`, message);

          // Keep the error attached to this attempt only; a later worker
          // assignment must not be overwritten by an old publication failure.
          const guard = [eq(deployments.id, id), eq(deployments.state, 'running')];
          if (outcome.attemptId) {
            guard.push(eq(deployments.attemptId, outcome.attemptId));
          } else if (targetWorkerId) {
            guard.push(eq(deployments.workerId, targetWorkerId));
          }
          await db
            .update(deployments)
            .set({ routingStatus: 'failed', routingError: message, updatedAt: new Date() })
            .where(and(...guard));
        }
      })().catch((publicationErr) => {
        console.warn(
          `[InternalDeployments] Failed to persist gateway publication status for ${id}:`,
          publicationErr instanceof Error ? publicationErr.message : String(publicationErr)
        );
      });
    } else if (outcome.state === 'stopped' || outcome.state === 'failed') {
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
