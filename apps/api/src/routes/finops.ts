import { Router, Request, Response } from 'express';
import { optionalAdmin } from '../middlewares/auth.js';
import { db, isDatabaseAvailable } from '../db/index.js';
import { workerNodes, deployments } from '../db/schema.js';
import { memoryStore } from '../db/memory-store.js';
import { calculateFinOpsSummary } from '../services/finops-calculator.js';
import { WorkerNode, Deployment, RoutingStatusSchema } from '@cloud-without-clouds/shared';

export const finopsRouter: Router = Router();

function mapWorkerRowToNode(row: typeof workerNodes.$inferSelect): WorkerNode {
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    ipAddress: row.ipAddress,
    port: row.port,
    state: row.state,
    resources: {
      cpuCount: row.cpuCount,
      cpuUsagePercent: Number(row.cpuUsagePercent ?? 0),
      totalMemoryMb: row.totalMemoryMb,
      freeMemoryMb: row.freeMemoryMb,
      usedMemoryMb: row.usedMemoryMb,
      activeContainers: row.activeContainers,
    },
    limits: {
      maxConcurrentWorkloads: row.maxConcurrentWorkloads,
      maxMemoryMb: row.maxMemoryMb,
      maxCpuCores: row.maxCpuCores,
    },
    version: row.version,
    registeredAt: row.registeredAt.toISOString(),
    lastHeartbeatAt: row.lastHeartbeatAt.toISOString(),
  };
}

function mapDeploymentRow(row: typeof deployments.$inferSelect): Deployment {
  const routingStatus = RoutingStatusSchema.safeParse(row.routingStatus);
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

/**
 * GET /api/v1/finops/summary
 * Returns real-time cloud cost arbitrage, AWS benchmark pricing,
 * and ESG carbon offset calculations dynamically derived from connected workers.
 */
finopsRouter.get('/summary', optionalAdmin, async (_req: Request, res: Response) => {
  if (!isDatabaseAvailable()) {
    const workers = memoryStore.getWorkers();
    const deps = memoryStore.getDeployments();
    const summary = calculateFinOpsSummary(workers, deps);
    res.status(200).json({
      success: true,
      data: summary,
      source: 'in-memory-dev',
    });
    return;
  }

  try {
    const workerRows = await db.select().from(workerNodes);
    const depRows = await db.select().from(deployments);

    const workers = workerRows.map(mapWorkerRowToNode);
    const deps = depRows.map(mapDeploymentRow);
    const summary = calculateFinOpsSummary(workers, deps);

    res.status(200).json({
      success: true,
      data: summary,
      source: 'database',
    });
  } catch (error) {
    const workers = memoryStore.getWorkers();
    const deps = memoryStore.getDeployments();
    const summary = calculateFinOpsSummary(workers, deps);
    res.status(200).json({
      success: true,
      data: summary,
      source: 'fallback-memory',
    });
  }
});
