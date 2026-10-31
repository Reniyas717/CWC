import { Router, Request, Response } from 'express';
import { eq, desc, or, asc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import {
  Deployment,
  DeploymentLogEntry,
  AppFrameworkSchema,
} from '@cloud-without-clouds/shared';
import { requireAdmin, optionalAdmin } from '../middlewares/auth.js';
import { db } from '../db/index.js';
import {
  users,
  applications,
  deployments,
  deploymentLogs,
  deploymentEvents,
  workerNodes,
} from '../db/schema.js';

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
  return {
    id: row.id,
    applicationId: row.applicationId,
    version: row.version,
    gitCommitHash: row.gitCommitHash ?? undefined,
    gitBranch: row.gitBranch,
    state: row.state,
    workerId: row.workerId ?? undefined,
    containerId: row.containerId ?? undefined,
    assignedPort: row.assignedPort ?? undefined,
    publicUrl: row.publicUrl ?? undefined,
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

    // 2. Worker Selection (MVP Assignment)
    let assignedWorkerId = payload.workerId;

    if (!assignedWorkerId) {
      // Find candidate worker that is currently idle or busy
      const eligibleWorkers = await db
        .select()
        .from(workerNodes)
        .where(or(eq(workerNodes.state, 'idle'), eq(workerNodes.state, 'busy')))
        .orderBy(asc(workerNodes.activeContainers))
        .limit(1);

      if (eligibleWorkers.length > 0) {
        assignedWorkerId = eligibleWorkers[0].id;
      }
    }

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
        ? `Queued and assigned to worker '${assignedWorkerId}'`
        : 'Queued (awaiting worker availability)',
      timestamp: now,
    });

    const createdRows = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, deploymentId));

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
 * GET /api/v1/deployments
 * Lists all deployments, with optional filtering by applicationId.
 * Open in dev mode, guarded by optionalAdmin.
 */
deploymentsRouter.get('/', optionalAdmin, async (req: Request, res: Response) => {
  const { applicationId } = req.query;

  try {
    let rows;
    if (typeof applicationId === 'string') {
      rows = await db
        .select()
        .from(deployments)
        .where(eq(deployments.applicationId, applicationId))
        .orderBy(desc(deployments.createdAt));
    } else {
      rows = await db.select().from(deployments).orderBy(desc(deployments.createdAt));
    }

    const data: Deployment[] = rows.map(mapDeploymentRow);

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve deployments',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * GET /api/v1/deployments/:id
 * Retrieves full details for a specific deployment.
 */
deploymentsRouter.get('/:id', optionalAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const rows = await db.select().from(deployments).where(eq(deployments.id, id));

    if (rows.length === 0) {
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
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve deployment logs',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * POST /api/v1/deployments/:id/cancel
 * Cancels an active or queued deployment. Requires ADMIN_TOKEN.
 */
deploymentsRouter.post('/:id/cancel', requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
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

    await db
      .update(deployments)
      .set({
        state: 'cancelled',
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
