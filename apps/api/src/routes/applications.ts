import { Router, Request, Response } from 'express';
import { AppConfig } from '@cloud-without-clouds/shared';
import { optionalAdmin } from '../middlewares/auth.js';
import { db } from '../db/index.js';
import { applications } from '../db/schema.js';

export const applicationsRouter: Router = Router();

function mapApplicationRow(row: typeof applications.$inferSelect): AppConfig {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    framework: row.framework,
    git: {
      repositoryUrl: row.repositoryUrl,
      branch: row.gitBranch,
      rootDirectory: row.rootDirectory,
    },
    port: row.targetPort,
    env: row.envVars,
    replicas: 1,
    resourceLimits: {
      cpuLimitCores: row.cpuLimitCores,
      memoryLimitMb: row.memoryLimitMb,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * GET /api/v1/applications
 * Lists application records persisted by the control plane.
 */
applicationsRouter.get('/', optionalAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(applications);
    const data = rows.map(mapApplicationRow);

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
        message: 'Failed to retrieve applications',
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});
