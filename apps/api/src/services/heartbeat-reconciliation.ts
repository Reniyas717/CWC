import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { db } from '../db/index.js';
import { deploymentEvents, deployments } from '../db/schema.js';

// A deployment that has only just transitioned to running can be absent from
// the first heartbeat while the worker finishes registering its workload in
// memory. Require its stable running start time to be older than this grace
// period before reconciling it. Gateway publication may refresh updatedAt.
export const HEARTBEAT_WORKLOAD_GRACE_MS = 30_000;

export interface MissingRunningDeployment {
  deploymentId: string;
  workerId: string;
  attemptId: string | null;
}

export async function reconcileMissingRunningDeployments(options: {
  workerId: string;
  activeWorkloadIds: string[];
  now?: Date;
}): Promise<MissingRunningDeployment[]> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - HEARTBEAT_WORKLOAD_GRACE_MS);
  const activeWorkloads = new Set(options.activeWorkloadIds);

  return db.transaction(async (tx) => {
    const candidates = await tx
      .select({
        deploymentId: deployments.id,
        workerId: deployments.workerId,
        attemptId: deployments.attemptId,
        startedAt: deployments.startedAt,
        updatedAt: deployments.updatedAt,
      })
      .from(deployments)
      .where(
        and(
          eq(deployments.workerId, options.workerId),
          eq(deployments.state, 'running')
        )
      );

    const missing: MissingRunningDeployment[] = [];
    for (const candidate of candidates) {
      const runningSince = candidate.startedAt ?? candidate.updatedAt;
      if (
        !candidate.workerId ||
        activeWorkloads.has(candidate.deploymentId) ||
        runningSince >= cutoff
      ) {
        continue;
      }

      const updated = await tx
        .update(deployments)
        .set({
          state: 'failed',
          publicUrl: null,
          routingStatus: 'failed',
          routingError: 'Worker heartbeat no longer reports this running workload',
          errorMessage: 'Managed container disappeared after worker restart or runtime loss',
          finishedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(deployments.id, candidate.deploymentId),
            eq(deployments.workerId, options.workerId),
            eq(deployments.state, 'running'),
            or(
              and(
                isNull(deployments.startedAt),
                lt(deployments.updatedAt, cutoff)
              ),
              lt(deployments.startedAt, cutoff)
            )
          )
        )
        .returning({ id: deployments.id });

      if (updated.length === 0) continue;

      await tx.insert(deploymentEvents).values({
        deploymentId: candidate.deploymentId,
        eventType: 'WORKER_HEARTBEAT_RECONCILED',
        details: `Worker '${options.workerId}' no longer reports the running workload in its active workload list`,
        timestamp: now,
      });

      missing.push({
        deploymentId: candidate.deploymentId,
        workerId: options.workerId,
        attemptId: candidate.attemptId,
      });
    }

    return missing;
  });
}
