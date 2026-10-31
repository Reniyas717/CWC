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
 * GET /api/v1/applications
 * Lists application records persisted by the control plane with optional pagination.
 */
applicationsRouter.get('/', optionalAdmin, async (req: Request, res: Response) => {
  const { page, limit } = req.query;
  const pageNum = page ? Math.max(1, parseInt(String(page), 10) || 1) : undefined;
  const limitNum = limit ? Math.max(1, parseInt(String(limit), 10) || 10) : undefined;

  if (!isDatabaseAvailable()) {
    const data = memoryStore.getApplications();
    sendCollectionResponse(res, data, pageNum, limitNum);
    return;
  }

  try {
    const rows = await db.select().from(applications);
    const data = rows.map(mapApplicationRow);
    sendCollectionResponse(res, data, pageNum, limitNum);
  } catch (error) {
    const data = memoryStore.getApplications();
    sendCollectionResponse(res, data, pageNum, limitNum);
  }
});
