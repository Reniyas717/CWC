import { Router, Request, Response } from 'express';
import { AppConfig } from '@cloud-without-clouds/shared';
import { optionalAdmin } from '../middlewares/auth.js';
import { db, isDatabaseAvailable } from '../db/index.js';
import { applications } from '../db/schema.js';
import { memoryStore } from '../db/memory-store.js';

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
  if (!isDatabaseAvailable()) {
    const data = memoryStore.getApplications();
    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
    return;
  }

  try {
    const rows = await db.select().from(applications);
    const data = rows.map(mapApplicationRow);

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    const data = memoryStore.getApplications();
    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  }
});
