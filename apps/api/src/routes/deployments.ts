import { Router, Request, Response } from 'express';
import { eq, desc, asc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import {
  Deployment,
  DeploymentLogEntry,
  AppFrameworkSchema,
  RoutingStatusSchema,
} from '@cloud-without-clouds/shared';
import { requireAdmin, optionalAdmin } from '../middlewares/auth.js';
import { db, isDatabaseAvailable } from '../db/index.js';
import { memoryStore } from '../db/memory-store.js';
import {
  users,
  applications,
  deployments,
  deploymentLogs,
  deploymentEvents,
  workerNodes,
} from '../db/schema.js';
import { selectBestWorker, evaluateWorkerEligibility } from '../services/scheduler.js';
import { gatewayClient } from '../services/gateway-client.js';
import { removeDeploymentRoute } from '../services/route-cleanup.js';

export const deploymentsRouter: Router = Router();

/**
 * Ensures the default platform administrator exists in the `users` table
 * to satisfy the foreign key constraint on `applications.user_id`.
 */
async function ensureDefaultAdminUser(): Promise<string> {
  const adminId = 'admin';
  await db
    .insert(users)
    .values({
      id: adminId,
      email: 'admin@cloudwithoutclouds.dev',
      name: 'Platform Administrator',
    })
    .onConflictDoNothing();
  return adminId;
}

/**
 * Transforms a database deployment record into the canonical `Deployment` type.
 */
function mapDeploymentRow(row: typeof deployments.$inferSelect): Deployment {
  const routingStatus = RoutingStatusSchema.safeParse(row.routingStatus);
  if (!routingStatus.success) {
    console.warn(
      `[Deployments] Invalid routing status '${row.routingStatus}' for ${row.id}; using pending`
    );
  }
  return {
    id: row.id,
    applicationId: row.applicationId,
    version: row.version,
    gitCommitHash: row.gitCommitHash ?? undefined,
    gitBranch: row.gitBranch,
    state: row.state,
    workerId: row.workerId ?? undefined,
    attemptId: row.attemptId ?? undefined,
    containerId: row.containerId ?? undefined,
    assignedPort: row.assignedPort ?? undefined,
    publicUrl: row.publicUrl ?? undefined,
    workerUrl: row.workerUrl ?? undefined,
    routingStatus: routingStatus.success ? routingStatus.data : 'pending',
    routingError: row.routingError ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? undefined,
    finishedAt: row.finishedAt?.toISOString() ?? undefined,
  };
}

const CreateDeploymentInputSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  framework: AppFrameworkSchema.default('dockerfile'),
  git: z.object({
    repositoryUrl: z.string().url(),
    branch: z.string().default('main'),
    rootDirectory: z.string().default('/'),
    commitHash: z.string().optional(),
  }),
  port: z.number().int().min(1).max(65535).default(3000),
  env: z
    .array(
      z.object({
        key: z.string().min(1),
        value: z.string(),
        isSecret: z.boolean().default(false),
      })
    )
    .default([]),
  resourceLimits: z
    .object({
      cpuLimitCores: z.number().positive().default(1.0),
      memoryLimitMb: z.number().int().positive().default(512),
    })
    .default({ cpuLimitCores: 1.0, memoryLimitMb: 512 }),
  applicationId: z.string().optional(),
  workerId: z.string().optional(),
});

/**
 * POST /api/v1/deployments
 * Creates and queues a new deployment from a Git repository.
 * Requires ADMIN_TOKEN.
 */
deploymentsRouter.post('/', requireAdmin, async (req: Request, res: Response) => {
  const parseResult = CreateDeploymentInputSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid deployment creation payload',
        details: parseResult.error.flatten(),
      },
    });
    return;
  }

  const payload = parseResult.data;
  const now = new Date();

  if (!isDatabaseAvailable()) {
    const deployment = memoryStore.createDeployment(payload);
    res.status(201).json({
      success: true,
      data: deployment,
      message: 'Deployment queued successfully (dev in-memory mode)',
    });
    return;
  }

  try {
    const adminId = await ensureDefaultAdminUser();

    // 1. Resolve or create Application
    let appId = payload.applicationId;
    const computedSlug =
      payload.slug ||
      payload.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    if (!appId) {
      // Check if application with slug already exists
      const existingApp = await db
        .select()
        .from(applications)
        .where(eq(applications.slug, computedSlug));

      if (existingApp.length > 0) {
        appId = existingApp[0].id;
        await db
          .update(applications)
          .set({
            repositoryUrl: payload.git.repositoryUrl,
            gitBranch: payload.git.branch,
            rootDirectory: payload.git.rootDirectory,
            targetPort: payload.port,
            envVars: payload.env,
            cpuLimitCores: payload.resourceLimits.cpuLimitCores,
            memoryLimitMb: payload.resourceLimits.memoryLimitMb,
            updatedAt: now,
          })
          .where(eq(applications.id, appId));
      } else {
        appId = `app-${randomUUID().slice(0, 8)}`;
        await db.insert(applications).values({
          id: appId,
          userId: adminId,
          name: payload.name,
          slug: computedSlug,
          framework: payload.framework,
          repositoryUrl: payload.git.repositoryUrl,
          gitBranch: payload.git.branch,
          rootDirectory: payload.git.rootDirectory,
          targetPort: payload.port,
          envVars: payload.env,
          cpuLimitCores: payload.resourceLimits.cpuLimitCores,
          memoryLimitMb: payload.resourceLimits.memoryLimitMb,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // 2. Resource-Aware Worker Selection (Least-Loaded Placement)
    const placement = await selectBestWorker(
      payload.resourceLimits.memoryLimitMb,
      payload.workerId
    );
    const assignedWorkerId = placement.worker ? placement.worker.id : null;
    const placementScore = placement.score;

    // 3. Compute deployment version number
    const prevDeployments = await db
      .select({ version: deployments.version })
      .from(deployments)
      .where(eq(deployments.applicationId, appId));

    const nextVersion = prevDeployments.length + 1;
    const deploymentId = `dep-${randomUUID().slice(0, 8)}`;

    // 4. Create deployment record in state 'queued'
    await db.insert(deployments).values({
      id: deploymentId,
      applicationId: appId,
      workerId: assignedWorkerId ?? null,
      version: nextVersion,
      gitCommitHash: payload.git.commitHash,
      gitBranch: payload.git.branch,
      state: 'queued',
      createdAt: now,
      updatedAt: now,
    });

    // 5. Record discrete audit event
    await db.insert(deploymentEvents).values({
      deploymentId,
      eventType: 'SCHEDULED',
      details: assignedWorkerId
        ? `Queued and assigned to least-loaded worker '${assignedWorkerId}' (Load Score: ${placementScore ?? 'N/A'})`
        : `Queued (awaiting worker availability: ${placement.reason || 'no eligible worker'})`,
      timestamp: now,
    });

    const createdRows = await db.select().from(deployments).where(eq(deployments.id, deploymentId));

    res.status(201).json({
      success: true,
      data: mapDeploymentRow(createdRows[0]),
      message: 'Deployment queued successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'DEPLOYMENT_CREATION_FAILED',
        message: 'Failed to create and queue deployment',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * Formats API collection responses with optional pagination support.
 */
function sendCollectionResponse<T>(
  res: Response,
  allData: T[],
  pageNum?: number,
  limitNum?: number
) {
  const totalCount = allData.length;
  if (pageNum !== undefined && limitNum !== undefined) {
    const start = (pageNum - 1) * limitNum;
    const pagedData = allData.slice(start, start + limitNum);
    res.status(200).json({
      success: true,
      count: pagedData.length,
      data: pagedData,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / limitNum)),
      },
    });
    return;
  }

  res.status(200).json({
    success: true,
    count: totalCount,
    data: allData,
  });
}

/**
 * GET /api/v1/deployments
 * Lists all deployments, with optional filtering by applicationId and optional pagination.
 * Open in dev mode, guarded by optionalAdmin.
 */
deploymentsRouter.get('/', optionalAdmin, async (req: Request, res: Response) => {
  const { applicationId, page, limit } = req.query;
  const appId = typeof applicationId === 'string' ? applicationId : undefined;
  const pageNum = page ? Math.max(1, parseInt(String(page), 10) || 1) : undefined;
  const limitNum = limit ? Math.max(1, parseInt(String(limit), 10) || 10) : undefined;

  if (!isDatabaseAvailable()) {
    const data = memoryStore.getDeployments(appId);
    sendCollectionResponse(res, data, pageNum, limitNum);
    return;
  }

  try {
    let rows;
    if (appId) {
      rows = await db
        .select()
        .from(deployments)
        .where(eq(deployments.applicationId, appId))
        .orderBy(desc(deployments.createdAt));
    } else {
      rows = await db.select().from(deployments).orderBy(desc(deployments.createdAt));
    }

    const data: Deployment[] = rows.map(mapDeploymentRow);
    sendCollectionResponse(res, data, pageNum, limitNum);
  } catch (error) {
    const data = memoryStore.getDeployments(appId);
    sendCollectionResponse(res, data, pageNum, limitNum);
  }
});

/**
 * GET /api/v1/deployments/:id
 * Retrieves full details for a specific deployment.
 */
deploymentsRouter.get('/:id', optionalAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!isDatabaseAvailable()) {
    const dep = memoryStore.getDeployment(id);
    if (!dep) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Deployment '${id}' not found` },
      });
      return;
    }
    res.status(200).json({ success: true, data: dep });
    return;
  }

  try {
    const rows = await db.select().from(deployments).where(eq(deployments.id, id));

    if (rows.length === 0) {
      const dep = memoryStore.getDeployment(id);
      if (dep) {
        res.status(200).json({ success: true, data: dep });
        return;
      }
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Deployment '${id}' not found`,
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: mapDeploymentRow(rows[0]),
    });
  } catch (error) {
    const dep = memoryStore.getDeployment(id);
    if (dep) {
      res.status(200).json({ success: true, data: dep });
      return;
    }
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve deployment',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * GET /api/v1/deployments/:id/logs
 * Retrieves build and container runtime logs for a deployment.
 */
deploymentsRouter.get('/:id/logs', optionalAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!isDatabaseAvailable()) {
    const data = memoryStore.getLogs(id);
    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
    return;
  }

  try {
    const rows = await db
      .select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.deploymentId, id))
      .orderBy(asc(deploymentLogs.id));

    const data: DeploymentLogEntry[] = rows.map((r) => ({
      id: String(r.id),
      timestamp: r.timestamp.toISOString(),
      level: r.level,
      message: r.message,
      stream: r.stream,
    }));

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    const data = memoryStore.getLogs(id);
    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  }
});

/**
 * POST /api/v1/deployments/:id/cancel
 * Cancels an active or queued deployment. Requires ADMIN_TOKEN.
 */
deploymentsRouter.post('/:id/cancel', requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;

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

    const current = existing[0];
    if (
      current.state === 'stopped' ||
      current.state === 'failed' ||
      current.state === 'cancelled'
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: `Deployment is already in terminal state: ${current.state}`,
        },
      });
      return;
    }

    const now = new Date();
    const previousAttemptId = current.attemptId ?? undefined;

    await db
      .update(deployments)
      .set({
        state: 'cancelled',
        // Invalidate the worker's assignment before notifying it. Any result
        // already in flight now fails the attempt-identity check.
        attemptId: null,
        publicUrl: null,
        routingStatus: 'pending',
        routingError: null,
        finishedAt: now,
        updatedAt: now,
      })
      .where(eq(deployments.id, id));

    await db.insert(deploymentEvents).values({
      deploymentId: id,
      eventType: 'CANCELLED',
      details: 'Deployment cancelled by administrator',
      timestamp: now,
    });

    // Remove route from Gateway. The request carries the old attempt identity
    // so cancellation cannot delete a route published by a replacement.
    await removeDeploymentRoute({
      deploymentId: id,
      gatewayAttemptId: previousAttemptId,
      currentAttemptId: null,
      expectedState: 'cancelled',
    });

    res.status(200).json({
      success: true,
      message: 'Deployment cancelled successfully',
      deploymentId: id,
      state: 'cancelled',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CANCEL_FAILED',
        message: 'Failed to cancel deployment',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * POST /api/v1/deployments/:id/relocate
 * Manually relocates an active deployment to a specific target worker node.
 * Evaluates target worker eligibility and hardware constraints.
 * Body: { targetWorkerId: string }
 */
deploymentsRouter.post('/:id/relocate', requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { targetWorkerId } = req.body || {};

  if (!targetWorkerId || typeof targetWorkerId !== 'string') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'targetWorkerId is required and must be a string',
      },
    });
    return;
  }

  if (!isDatabaseAvailable()) {
    try {
      const updated = memoryStore.relocateDeployment(id, targetWorkerId);
      res.status(200).json({
        success: true,
        message: `Workload '${id}' successfully relocated to target worker (dev in-memory mode)`,
        data: updated,
      });
      return;
    } catch (err) {
      res.status(400).json({
        success: false,
        error: {
          code: 'RELOCATE_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      });
      return;
    }
  }

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

    const current = existing[0];
    if (
      current.state === 'stopped' ||
      current.state === 'failed' ||
      current.state === 'cancelled'
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: `Cannot relocate deployment in terminal state: ${current.state}`,
        },
      });
      return;
    }

    if (current.workerId === targetWorkerId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'SAME_TARGET',
          message: `Deployment is already assigned to target worker '${targetWorkerId}'`,
        },
      });
      return;
    }

    const targetRows = await db.select().from(workerNodes).where(eq(workerNodes.id, targetWorkerId));
    if (targetRows.length === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'WORKER_NOT_FOUND',
          message: `Target worker '${targetWorkerId}' does not exist`,
        },
      });
      return;
    }

    const targetWorker = targetRows[0];
    const sourceWorkerId = current.workerId;

    // Fetch app memory requirements
    const appRows = await db.select().from(applications).where(eq(applications.id, current.applicationId));
    const reqMemory = appRows.length > 0 ? appRows[0].memoryLimitMb : 512;

    const eligibility = evaluateWorkerEligibility(targetWorker, reqMemory);
    if (!eligibility.eligible) {
      res.status(400).json({
        success: false,
        error: {
          code: 'TARGET_INELIGIBLE',
          message: `Target worker '${targetWorker.name}' is ineligible: ${eligibility.rejectionReasons.join(', ')}`,
          details: eligibility.rejectionReasons,
        },
      });
      return;
    }

    const now = new Date();

    // Reassign deployment to target worker, reset port & containerId, set to queued
    await db
      .update(deployments)
      .set({
        workerId: targetWorkerId,
        state: 'queued',
        assignedPort: null,
        containerId: null,
        updatedAt: now,
      })
      .where(eq(deployments.id, id));

    // Record audit event
    await db.insert(deploymentEvents).values({
      deploymentId: id,
      eventType: 'RELOCATED',
      details: `Workload manually relocated from worker '${sourceWorkerId || 'none'}' to '${targetWorker.name}' (${targetWorkerId})`,
      timestamp: now,
    });

    const updatedRows = await db.select().from(deployments).where(eq(deployments.id, id));

    res.status(200).json({
      success: true,
      message: `Workload '${id}' successfully relocated to '${targetWorker.name}'`,
      data: mapDeploymentRow(updatedRows[0]),
      relocation: {
        deploymentId: id,
        sourceWorkerId,
        targetWorkerId,
        targetWorkerName: targetWorker.name,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'RELOCATE_FAILED',
        message: 'Failed to relocate deployment',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * DELETE /api/v1/deployments/:id
 * Deletes a deployment record and cleans up associated Gateway routes.
 * Requires ADMIN_TOKEN.
 */
deploymentsRouter.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
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

    const current = existing[0];

    // Reject active workloads before touching the gateway. Operators must
    // cancel/stop the workload explicitly; a rejected delete must not cause
    // an otherwise healthy public route to disappear.
    if (
      current.state === 'running' ||
      current.state === 'building' ||
      current.state === 'deploying' ||
      current.state === 'queued'
    ) {
      res.status(400).json({
        success: false,
        error: {
          code: 'ACTIVE_DEPLOYMENT',
          message: `Cannot delete active deployment '${id}' in state '${current.state}'. Please cancel the deployment first.`,
        },
      });
      return;
    }

    // Remove route from Gateway idempotently. Do not delete the database row
    // while the edge still has an unreachable-to-control-plane route.
    const routeRemoved = await gatewayClient.removeRoute(id, current.attemptId ?? undefined);
    if (!routeRemoved) {
      res.status(502).json({
        success: false,
        error: {
          code: 'ROUTE_CLEANUP_FAILED',
          message: 'Gateway route removal failed; retry the delete operation',
        },
      });
      return;
    }

    // Delete record from database (foreign key cascade removes logs and events)
    await db.delete(deployments).where(eq(deployments.id, id));

    res.status(200).json({
      success: true,
      message: 'Deployment deleted successfully',
      deploymentId: id,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_FAILED',
        message: 'Failed to delete deployment',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});
