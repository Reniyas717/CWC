import { eq, and, or, gte, asc, isNull } from 'drizzle-orm';
import { db, isDatabaseAvailable } from '../db/index.js';
import { workerNodes, deployments, deploymentEvents, applications } from '../db/schema.js';
import { memoryStore } from '../db/memory-store.js';
import { HEARTBEAT_TIMEOUT_MS } from './sweeper.js';

export interface WorkerScoreBreakdown {
  workerId: string;
  name: string;
  score: number;
  memoryRatio: number;
  cpuRatio: number;
  containerRatio: number;
  freeMemoryMb: number;
  usedMemoryMb: number;
  totalMemoryMb: number;
  cpuUsagePercent: number;
  activeContainers: number;
  maxConcurrentWorkloads: number;
  eligible: boolean;
  rejectionReasons: string[];
}

export interface SchedulerPlacementResult {
  worker: typeof workerNodes.$inferSelect | null;
  score: number | null;
  breakdown: WorkerScoreBreakdown | null;
  candidatesEvaluated: number;
  reason?: string;
}

/**
 * Computes the normalized Load Score S(W) according to Section 9 of ARCHITECTURE.md:
 * S(W) = (0.4 * usedMem / totalMem) + (0.4 * cpuUsage / 100) + (0.2 * activeContainers / maxConcurrent)
 */
export function calculateWorkerLoadScore(worker: typeof workerNodes.$inferSelect): {
  score: number;
  memoryRatio: number;
  cpuRatio: number;
  containerRatio: number;
} {
  const totalMem = Math.max(worker.totalMemoryMb, 1);
  const usedMem = Math.max(worker.usedMemoryMb, 0);
  const memoryRatio = Math.min(Math.max(usedMem / totalMem, 0), 1);

  const cpuUsage = Math.max(worker.cpuUsagePercent, 0);
  const cpuRatio = Math.min(Math.max(cpuUsage / 100, 0), 1);

  const maxWorkloads = Math.max(worker.maxConcurrentWorkloads, 1);
  const activeCont = Math.max(worker.activeContainers, 0);
  const containerRatio = Math.min(Math.max(activeCont / maxWorkloads, 0), 1);

  const score = 0.4 * memoryRatio + 0.4 * cpuRatio + 0.2 * containerRatio;

  return {
    score: Number(score.toFixed(4)),
    memoryRatio: Number(memoryRatio.toFixed(4)),
    cpuRatio: Number(cpuRatio.toFixed(4)),
    containerRatio: Number(containerRatio.toFixed(4)),
  };
}

/**
 * Checks if a worker satisfies all 4 eligibility filters:
 * 1. State in ('idle', 'busy')
 * 2. Last heartbeat <= 30 seconds ago
 * 3. Active containers < maxConcurrentWorkloads
 * 4. Free memory >= required memory limit
 */
export function evaluateWorkerEligibility(
  worker: typeof workerNodes.$inferSelect,
  requiredMemoryMb: number,
  now: Date = new Date()
): { eligible: boolean; rejectionReasons: string[] } {
  const reasons: string[] = [];
  const cutoff = new Date(now.getTime() - HEARTBEAT_TIMEOUT_MS);

  if (worker.state !== 'idle' && worker.state !== 'busy') {
    reasons.push(`State is '${worker.state}' (must be 'idle' or 'busy')`);
  }

  if (worker.lastHeartbeatAt < cutoff) {
    const elapsedSeconds = Math.round((now.getTime() - worker.lastHeartbeatAt.getTime()) / 1000);
    reasons.push(`Heartbeat timed out (${elapsedSeconds}s ago > 30s threshold)`);
  }

  if (worker.activeContainers >= worker.maxConcurrentWorkloads) {
    reasons.push(
      `Concurrency capacity exhausted (${worker.activeContainers}/${worker.maxConcurrentWorkloads} active)`
    );
  }

  if (worker.freeMemoryMb < requiredMemoryMb) {
    reasons.push(
      `Insufficient free memory (${worker.freeMemoryMb}MB available < ${requiredMemoryMb}MB required)`
    );
  }

  return {
    eligible: reasons.length === 0,
    rejectionReasons: reasons,
  };
}

/**
 * Evaluates all registered workers and returns their load scores and eligibility breakdowns.
 */
export async function getWorkerLoadScores(requiredMemoryMb = 512): Promise<WorkerScoreBreakdown[]> {
  if (!isDatabaseAvailable()) {
    return memoryStore.getWorkerScores(requiredMemoryMb);
  }

  try {
    const workers = await db.select().from(workerNodes);
    const now = new Date();

    return workers.map((worker) => {
      const { score, memoryRatio, cpuRatio, containerRatio } = calculateWorkerLoadScore(worker);
      const { eligible, rejectionReasons } = evaluateWorkerEligibility(worker, requiredMemoryMb, now);

      return {
        workerId: worker.id,
        name: worker.name,
        score,
        memoryRatio,
        cpuRatio,
        containerRatio,
        freeMemoryMb: worker.freeMemoryMb,
        usedMemoryMb: worker.usedMemoryMb,
        totalMemoryMb: worker.totalMemoryMb,
        cpuUsagePercent: worker.cpuUsagePercent,
        activeContainers: worker.activeContainers,
        maxConcurrentWorkloads: worker.maxConcurrentWorkloads,
        eligible,
        rejectionReasons,
      };
    });
  } catch {
    return memoryStore.getWorkerScores(requiredMemoryMb);
  }
}

/**
 * Core placement algorithm:
 * Selects the eligible candidate with the lowest load score S(W).
 * Applies 1% tie-breaking rule preferring the worker with higher free memory.
 */
export async function selectBestWorker(
  requiredMemoryMb: number = 512,
  preferredWorkerId?: string
): Promise<SchedulerPlacementResult> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - HEARTBEAT_TIMEOUT_MS);

  // 1. If a preferred worker was explicitly requested:
  if (preferredWorkerId) {
    const preferredRows = await db
      .select()
      .from(workerNodes)
      .where(eq(workerNodes.id, preferredWorkerId));

    if (preferredRows.length > 0) {
      const prefWorker = preferredRows[0];
      const { eligible, rejectionReasons } = evaluateWorkerEligibility(
        prefWorker,
        requiredMemoryMb,
        now
      );

      const metrics = calculateWorkerLoadScore(prefWorker);
      const breakdown: WorkerScoreBreakdown = {
        workerId: prefWorker.id,
        name: prefWorker.name,
        ...metrics,
        freeMemoryMb: prefWorker.freeMemoryMb,
        usedMemoryMb: prefWorker.usedMemoryMb,
        totalMemoryMb: prefWorker.totalMemoryMb,
        cpuUsagePercent: prefWorker.cpuUsagePercent,
        activeContainers: prefWorker.activeContainers,
        maxConcurrentWorkloads: prefWorker.maxConcurrentWorkloads,
        eligible,
        rejectionReasons,
      };

      if (eligible) {
        return {
          worker: prefWorker,
          score: metrics.score,
          breakdown,
          candidatesEvaluated: 1,
        };
      }
    }
  }

  // 2. Fetch all potentially active workers
  const candidates = await db
    .select()
    .from(workerNodes)
    .where(
      and(
        or(eq(workerNodes.state, 'idle'), eq(workerNodes.state, 'busy')),
        gte(workerNodes.lastHeartbeatAt, cutoff)
      )
    );

  if (candidates.length === 0) {
    return {
      worker: null,
      score: null,
      breakdown: null,
      candidatesEvaluated: 0,
      reason: 'No workers with recent heartbeats found in idle or busy state',
    };
  }

  // 3. Filter eligible workers and compute scores
  interface ScoredCandidate {
    worker: typeof workerNodes.$inferSelect;
    score: number;
    metrics: ReturnType<typeof calculateWorkerLoadScore>;
  }

  const eligibleCandidates: ScoredCandidate[] = [];

  for (const candidate of candidates) {
    const { eligible } = evaluateWorkerEligibility(candidate, requiredMemoryMb, now);
    if (eligible) {
      const metrics = calculateWorkerLoadScore(candidate);
      eligibleCandidates.push({
        worker: candidate,
        score: metrics.score,
        metrics,
      });
    }
  }

  if (eligibleCandidates.length === 0) {
    return {
      worker: null,
      score: null,
      breakdown: null,
      candidatesEvaluated: candidates.length,
      reason: 'All active workers failed resource eligibility constraints (memory or capacity limit)',
    };
  }

  // 4. Sort by score ascending, applying 1% tie-breaking on freeMemoryMb
  eligibleCandidates.sort((a, b) => {
    const scoreDiff = a.score - b.score;
    if (Math.abs(scoreDiff) < 0.01) {
      return b.worker.freeMemoryMb - a.worker.freeMemoryMb;
    }
    return scoreDiff;
  });

  const best = eligibleCandidates[0];
  const breakdown: WorkerScoreBreakdown = {
    workerId: best.worker.id,
    name: best.worker.name,
    ...best.metrics,
    freeMemoryMb: best.worker.freeMemoryMb,
    usedMemoryMb: best.worker.usedMemoryMb,
    totalMemoryMb: best.worker.totalMemoryMb,
    cpuUsagePercent: best.worker.cpuUsagePercent,
    activeContainers: best.worker.activeContainers,
    maxConcurrentWorkloads: best.worker.maxConcurrentWorkloads,
    eligible: true,
    rejectionReasons: [],
  };

  return {
    worker: best.worker,
    score: best.score,
    breakdown,
    candidatesEvaluated: candidates.length,
  };
}

/**
 * Re-evaluates queued deployments without assigned workers (exhaustion recovery).
 * Invoked when workers report heartbeats or new workers register.
 */
export async function schedulePendingDeployments(): Promise<number> {
  const unassignedDeployments = await db
    .select({
      deployment: deployments,
      application: applications,
    })
    .from(deployments)
    .innerJoin(applications, eq(deployments.applicationId, applications.id))
    .where(and(eq(deployments.state, 'queued'), isNull(deployments.routingError)))
    .orderBy(asc(deployments.createdAt));

  const pending = unassignedDeployments.filter(
    (item) => !item.deployment.workerId || item.deployment.workerId.trim() === ''
  );

  let scheduledCount = 0;
  const now = new Date();

  for (const item of pending) {
    const dep = item.deployment;
    const app = item.application;

    const placement = await selectBestWorker(app.memoryLimitMb);
    if (placement.worker) {
      await db
        .update(deployments)
        .set({
          workerId: placement.worker.id,
          updatedAt: now,
        })
        .where(eq(deployments.id, dep.id));

      await db.insert(deploymentEvents).values({
        deploymentId: dep.id,
        eventType: 'SCHEDULED',
        details: `Assigned to least-loaded worker '${placement.worker.id}' (Load Score: ${placement.score})`,
        timestamp: now,
      });

      console.log(
        `[Scheduler] Queued deployment '${dep.id}' assigned to worker '${placement.worker.id}' (Load Score: ${placement.score})`
      );
      scheduledCount++;
    }
  }

  return scheduledCount;
}

export interface WorkloadMigrationPlan {
  deploymentId: string;
  applicationId: string;
  applicationName: string;
  sourceWorkerId: string;
  sourceWorkerName: string;
  targetWorkerId: string;
  targetWorkerName: string;
  memoryMb: number;
  cpuCores: number;
}

export interface WorkerBalanceStat {
  workerId: string;
  workerName: string;
  totalMemoryMb: number;
  allocatedMemoryMb: number;
  activeContainers: number;
  initialRatio: number;
  projectedRatio: number;
  isPrimaryTarget: boolean;
}

export interface ClusterRebalanceResult {
  balanced: boolean;
  initialSkewPercent: number;
  projectedSkewPercent: number;
  targetClusterRatioPercent: number;
  migrations: WorkloadMigrationPlan[];
  workerStats: WorkerBalanceStat[];
  dryRun: boolean;
  executedAt: string;
}

/**
 * Capacity-weighted cluster rebalancing algorithm.
 * Proportional to hardware size: a 16 GB node and a 2 GB node are balanced when their
 * allocation ratios (allocated / total) are approximately equal, not raw megabytes.
 */
export async function rebalanceClusterWorkloads(options: {
  dryRun?: boolean;
} = {}): Promise<ClusterRebalanceResult> {
  const { dryRun = false } = options;
  const now = new Date();
  const cutoff = new Date(now.getTime() - HEARTBEAT_TIMEOUT_MS);

  // 1. Fetch all online, eligible worker nodes
  const workers = await db
    .select()
    .from(workerNodes)
    .where(
      and(
        or(eq(workerNodes.state, 'idle'), eq(workerNodes.state, 'busy')),
        gte(workerNodes.lastHeartbeatAt, cutoff)
      )
    );

  if (workers.length < 2) {
    return {
      balanced: true,
      initialSkewPercent: 0,
      projectedSkewPercent: 0,
      targetClusterRatioPercent: 0,
      migrations: [],
      workerStats: workers.map((w) => ({
        workerId: w.id,
        workerName: w.name,
        totalMemoryMb: w.totalMemoryMb,
        allocatedMemoryMb: w.usedMemoryMb,
        activeContainers: w.activeContainers,
        initialRatio: Number((w.usedMemoryMb / Math.max(w.totalMemoryMb, 1)).toFixed(4)),
        projectedRatio: Number((w.usedMemoryMb / Math.max(w.totalMemoryMb, 1)).toFixed(4)),
        isPrimaryTarget: true,
      })),
      dryRun,
      executedAt: now.toISOString(),
    };
  }

  // 2. Fetch all active deployments and their apps
  const activeDeployments = await db
    .select({
      deployment: deployments,
      application: applications,
    })
    .from(deployments)
    .innerJoin(applications, eq(deployments.applicationId, applications.id))
    .where(
      or(
        eq(deployments.state, 'running'),
        eq(deployments.state, 'building'),
        eq(deployments.state, 'queued')
      )
    );

  // 3. Compute per-worker allocated memory
  const workerAllocMap = new Map<
    string,
    {
      worker: typeof workerNodes.$inferSelect;
      allocatedMb: number;
      containers: typeof activeDeployments;
    }
  >();

  for (const w of workers) {
    workerAllocMap.set(w.id, {
      worker: w,
      allocatedMb: 0,
      containers: [],
    });
  }

  for (const item of activeDeployments) {
    if (item.deployment.workerId && workerAllocMap.has(item.deployment.workerId)) {
      const entry = workerAllocMap.get(item.deployment.workerId)!;
      entry.allocatedMb += item.application.memoryLimitMb || 512;
      entry.containers.push(item);
    }
  }

  // 4. Calculate total cluster capacity and proportional target ratio
  const totalClusterRam = workers.reduce((sum, w) => sum + w.totalMemoryMb, 0);
  const totalClusterAllocated = Array.from(workerAllocMap.values()).reduce(
    (sum, e) => sum + e.allocatedMb,
    0
  );
  const targetClusterRatio =
    totalClusterRam > 0 ? totalClusterAllocated / totalClusterRam : 0;

  // Initial ratios
  const workerStatsList: {
    workerId: string;
    workerName: string;
    totalMemoryMb: number;
    allocatedMemoryMb: number;
    activeContainers: number;
    initialRatio: number;
    projectedRatio: number;
  }[] = workers.map((w) => {
    const alloc = workerAllocMap.get(w.id)?.allocatedMb || 0;
    const ratio = alloc / Math.max(w.totalMemoryMb, 1);
    return {
      workerId: w.id,
      workerName: w.name,
      totalMemoryMb: w.totalMemoryMb,
      allocatedMemoryMb: alloc,
      activeContainers: workerAllocMap.get(w.id)?.containers.length || 0,
      initialRatio: Number(ratio.toFixed(4)),
      projectedRatio: Number(ratio.toFixed(4)),
    };
  });

  const ratios = workerStatsList.map((s) => s.initialRatio);
  const initialMinRatio = Math.min(...ratios);
  const initialMaxRatio = Math.max(...ratios);
  const initialSkewPercent = Number(((initialMaxRatio - initialMinRatio) * 100).toFixed(1));

  // If disparity is already low (<= 10%) or total allocated is 0, cluster is already balanced
  if (initialSkewPercent <= 10 || totalClusterAllocated === 0) {
    const minStat = workerStatsList.reduce((prev, curr) =>
      curr.initialRatio < prev.initialRatio ? curr : prev
    );

    return {
      balanced: true,
      initialSkewPercent,
      projectedSkewPercent: initialSkewPercent,
      targetClusterRatioPercent: Number((targetClusterRatio * 100).toFixed(1)),
      migrations: [],
      workerStats: workerStatsList.map((s) => ({
        ...s,
        isPrimaryTarget: s.workerId === minStat.workerId,
      })),
      dryRun,
      executedAt: now.toISOString(),
    };
  }

  // 5. Greedily select migrations to level the ratios
  const migrations: WorkloadMigrationPlan[] = [];
  const simulatedMap = new Map<string, { total: number; allocated: number; count: number }>();
  for (const s of workerStatsList) {
    simulatedMap.set(s.workerId, {
      total: s.totalMemoryMb,
      allocated: s.allocatedMemoryMb,
      count: s.activeContainers,
    });
  }

  const maxIterations = 5;
  for (let iter = 0; iter < maxIterations; iter++) {
    let highestRatioWorkerId = '';
    let lowestRatioWorkerId = '';
    let highestRatio = -1;
    let lowestRatio = 999;

    for (const [wId, sim] of simulatedMap.entries()) {
      const ratio = sim.allocated / Math.max(sim.total, 1);
      if (ratio > highestRatio) {
        highestRatio = ratio;
        highestRatioWorkerId = wId;
      }
      if (ratio < lowestRatio) {
        lowestRatio = ratio;
        lowestRatioWorkerId = wId;
      }
    }

    if (highestRatio - lowestRatio <= 0.12 || highestRatioWorkerId === lowestRatioWorkerId) {
      break;
    }

    const sourceEntry = workerAllocMap.get(highestRatioWorkerId);
    const targetWorker = workers.find((w) => w.id === lowestRatioWorkerId);
    if (!sourceEntry || !targetWorker || sourceEntry.containers.length === 0) {
      break;
    }

    const targetSim = simulatedMap.get(lowestRatioWorkerId)!;
    if (targetSim.count >= targetWorker.maxConcurrentWorkloads) {
      break;
    }

    const candidateItem = sourceEntry.containers.find((item) => {
      const mem = item.application.memoryLimitMb || 512;
      const targetFree = targetWorker.freeMemoryMb;
      return targetFree >= mem && !migrations.some((m) => m.deploymentId === item.deployment.id);
    });

    if (!candidateItem) {
      break;
    }

    const mem = candidateItem.application.memoryLimitMb || 512;
    const cpu = candidateItem.application.cpuLimitCores || 1.0;

    migrations.push({
      deploymentId: candidateItem.deployment.id,
      applicationId: candidateItem.application.id,
      applicationName: candidateItem.application.name,
      sourceWorkerId: highestRatioWorkerId,
      sourceWorkerName: sourceEntry.worker.name,
      targetWorkerId: lowestRatioWorkerId,
      targetWorkerName: targetWorker.name,
      memoryMb: mem,
      cpuCores: cpu,
    });

    const sourceSim = simulatedMap.get(highestRatioWorkerId)!;
    sourceSim.allocated -= mem;
    sourceSim.count -= 1;

    targetSim.allocated += mem;
    targetSim.count += 1;
  }

  // 6. Execute migrations in DB if not dryRun
  if (!dryRun && migrations.length > 0) {
    for (const m of migrations) {
      await db
        .update(deployments)
        .set({
          workerId: m.targetWorkerId,
          state: 'queued',
          assignedPort: null,
          containerId: null,
          updatedAt: now,
        })
        .where(eq(deployments.id, m.deploymentId));

      await db.insert(deploymentEvents).values({
        deploymentId: m.deploymentId,
        eventType: 'REBALANCED',
        details: `Cluster load equalization: moved from '${m.sourceWorkerName}' (${m.sourceWorkerId}) to '${m.targetWorkerName}' (${m.targetWorkerId})`,
        timestamp: now,
      });

      console.log(
        `[Equalizer] Migrated deployment '${m.deploymentId}' from ${m.sourceWorkerId} to ${m.targetWorkerId} for capacity balance.`
      );
    }
  }

  // 7. Calculate projected stats
  const finalRatios: number[] = [];
  const finalStats: WorkerBalanceStat[] = workerStatsList.map((s) => {
    const sim = simulatedMap.get(s.workerId);
    const projRatio = sim ? sim.allocated / Math.max(sim.total, 1) : s.initialRatio;
    finalRatios.push(projRatio);
    return {
      workerId: s.workerId,
      workerName: s.workerName,
      totalMemoryMb: s.totalMemoryMb,
      allocatedMemoryMb: sim ? sim.allocated : s.allocatedMemoryMb,
      activeContainers: sim ? sim.count : s.activeContainers,
      initialRatio: s.initialRatio,
      projectedRatio: Number(projRatio.toFixed(4)),
      isPrimaryTarget: false,
    };
  });

  const projMinRatio = Math.min(...finalRatios);
  const projMaxRatio = Math.max(...finalRatios);
  const projectedSkewPercent = Number(((projMaxRatio - projMinRatio) * 100).toFixed(1));

  let lowestStat = finalStats[0];
  for (const st of finalStats) {
    if (st.projectedRatio < lowestStat.projectedRatio) {
      lowestStat = st;
    }
  }
  lowestStat.isPrimaryTarget = true;

  return {
    balanced: migrations.length === 0 || projectedSkewPercent <= 12,
    initialSkewPercent,
    projectedSkewPercent,
    targetClusterRatioPercent: Number((targetClusterRatio * 100).toFixed(1)),
    migrations,
    workerStats: finalStats,
    dryRun,
    executedAt: now.toISOString(),
  };
}
