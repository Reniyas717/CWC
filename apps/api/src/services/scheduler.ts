import { eq, and, or, gte, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { workerNodes, deployments, deploymentEvents, applications } from '../db/schema.js';
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
    // Tie-breaker: if scores are within 1% (0.01), prefer higher freeMemoryMb
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
    .where(eq(deployments.state, 'queued'))
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
