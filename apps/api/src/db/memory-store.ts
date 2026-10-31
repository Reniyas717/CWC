import {
  WorkerNode,
  Deployment,
  AppConfig,
  DeploymentLogEntry,
} from '@cloud-without-clouds/shared';
import { randomUUID } from 'crypto';

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

// In-Memory Dev Store for when PostgreSQL is offline
class MemoryStore {
  private workers: Map<string, WorkerNode> = new Map();
  private applications: Map<string, AppConfig> = new Map();
  private deployments: Map<string, Deployment> = new Map();
  private logs: Map<string, DeploymentLogEntry[]> = new Map();

  constructor() {
    this.seed();
  }

  private seed() {
    // Seed 3 realistic workstations
    const w1: WorkerNode = {
      id: 'worker-node-local-01',
      name: 'Workstation Alpha (MacBook Pro M3 Max)',
      hostname: 'alpha-node.mesh.internal',
      ipAddress: '100.64.0.1',
      port: 4100,
      state: 'idle',
      resources: {
        cpuCount: 8,
        cpuUsagePercent: 14.5,
        totalMemoryMb: 16384,
        freeMemoryMb: 12288,
        usedMemoryMb: 4096,
        activeContainers: 1,
      },
      limits: {
        maxConcurrentWorkloads: 6,
        maxMemoryMb: 16384,
        maxCpuCores: 8,
      },
      version: '0.1.0',
      registeredAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
    };

    const w2: WorkerNode = {
      id: 'worker-node-laptop-02',
      name: 'Workstation Beta (ThinkPad X1 Carbon)',
      hostname: 'beta-node.mesh.internal',
      ipAddress: '100.64.0.2',
      port: 4100,
      state: 'idle',
      resources: {
        cpuCount: 4,
        cpuUsagePercent: 28.0,
        totalMemoryMb: 8192,
        freeMemoryMb: 5120,
        usedMemoryMb: 3072,
        activeContainers: 1,
      },
      limits: {
        maxConcurrentWorkloads: 4,
        maxMemoryMb: 8192,
        maxCpuCores: 4,
      },
      version: '0.1.0',
      registeredAt: new Date(Date.now() - 3600000 * 12).toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
    };

    const w3: WorkerNode = {
      id: 'worker-node-edge-03',
      name: 'Edge Node Gamma (Dell XPS 15)',
      hostname: 'gamma-node.mesh.internal',
      ipAddress: '100.64.0.3',
      port: 4100,
      state: 'idle',
      resources: {
        cpuCount: 4,
        cpuUsagePercent: 8.2,
        totalMemoryMb: 4096,
        freeMemoryMb: 3072,
        usedMemoryMb: 1024,
        activeContainers: 0,
      },
      limits: {
        maxConcurrentWorkloads: 2,
        maxMemoryMb: 4096,
        maxCpuCores: 4,
      },
      version: '0.1.0',
      registeredAt: new Date(Date.now() - 3600000 * 6).toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
    };

    this.workers.set(w1.id, w1);
    this.workers.set(w2.id, w2);
    this.workers.set(w3.id, w3);

    // Seed Applications
    const a1: AppConfig = {
      id: 'app-node-express-01',
      name: 'Distributed Express API Gateway',
      slug: 'express-api-gateway',
      framework: 'nodejs',
      git: {
        repositoryUrl: 'https://github.com/cloud-without-clouds/demo-node-app.git',
        branch: 'main',
        rootDirectory: '/',
        commitHash: 'f4b98c2',
      },
      port: 3000,
      replicas: 1,
      env: [
        { key: 'NODE_ENV', value: 'production', isSecret: false },
        { key: 'PORT', value: '3000', isSecret: false },
      ],
      resourceLimits: {
        cpuLimitCores: 1.0,
        memoryLimitMb: 512,
      },
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      updatedAt: new Date(Date.now() - 1200000).toISOString(),
    };

    const a2: AppConfig = {
      id: 'app-vite-static-02',
      name: 'Peer Mesh Status Dashboard',
      slug: 'peer-mesh-status',
      framework: 'static',
      git: {
        repositoryUrl: 'https://github.com/cloud-without-clouds/demo-static-web.git',
        branch: 'main',
        rootDirectory: '/',
        commitHash: 'e7102ad',
      },
      port: 80,
      replicas: 1,
      env: [{ key: 'VITE_API_ENDPOINT', value: '/api/v1', isSecret: false }],
      resourceLimits: {
        cpuLimitCores: 0.5,
        memoryLimitMb: 256,
      },
      createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    };

    this.applications.set(a1.id, a1);
    this.applications.set(a2.id, a2);

    // Seed Deployments
    const d1: Deployment = {
      id: 'dep-018e3a2b',
      applicationId: a1.id,
      version: 1,
      gitCommitHash: 'f4b98c2',
      gitBranch: 'main',
      state: 'running',
      workerId: w1.id,
      attemptId: 'att-1',
      containerId: 'cwc-cnt-a912f4b',
      assignedPort: 20015,
      publicUrl: 'https://express-api-gateway.trycloudflare.com',
      workerUrl: `http://${w1.ipAddress}:20015`,
      routingStatus: 'ready',
      createdAt: new Date(Date.now() - 1200000).toISOString(),
      updatedAt: new Date(Date.now() - 1180000).toISOString(),
      startedAt: new Date(Date.now() - 1195000).toISOString(),
    };

    const d2: Deployment = {
      id: 'dep-018e4b1c',
      applicationId: a2.id,
      version: 1,
      gitCommitHash: 'e7102ad',
      gitBranch: 'main',
      state: 'running',
      workerId: w2.id,
      attemptId: 'att-2',
      containerId: 'cwc-cnt-b823e5a',
      assignedPort: 20016,
      publicUrl: 'https://peer-mesh-status.trycloudflare.com',
      workerUrl: `http://${w2.ipAddress}:20016`,
      routingStatus: 'ready',
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 2 + 15000).toISOString(),
      startedAt: new Date(Date.now() - 3600000 * 2 + 10000).toISOString(),
    };

    this.deployments.set(d1.id, d1);
    this.deployments.set(d2.id, d2);

    // Seed Logs
    this.logs.set(d1.id, [
      {
        id: '1',
        stream: 'system',
        level: 'info',
        message: 'Deployment received and scheduled to worker-node-local-01',
        timestamp: new Date(Date.now() - 1200000).toISOString(),
      },
      {
        id: '2',
        stream: 'stdout',
        level: 'info',
        message: 'Cloning repository https://github.com/cloud-without-clouds/demo-node-app.git...',
        timestamp: new Date(Date.now() - 1198000).toISOString(),
      },
      {
        id: '3',
        stream: 'stdout',
        level: 'info',
        message: 'Successfully built container image cwc-img-express-api-gateway',
        timestamp: new Date(Date.now() - 1196000).toISOString(),
      },
      {
        id: '4',
        stream: 'system',
        level: 'info',
        message: 'Container started with assigned port 20015. Health checks passing.',
        timestamp: new Date(Date.now() - 1195000).toISOString(),
      },
    ]);
  }

  // Workers
  getWorkers(): WorkerNode[] {
    const now = new Date().toISOString();
    return Array.from(this.workers.values()).map((w) => ({
      ...w,
      lastHeartbeatAt: now,
    }));
  }

  getWorker(id: string): WorkerNode | undefined {
    return this.workers.get(id);
  }

  saveWorker(node: WorkerNode): void {
    this.workers.set(node.id, node);
  }

  // Scores
  getWorkerScores(requiredMemoryMb = 512): WorkerScoreBreakdown[] {
    return this.getWorkers().map((worker) => {
      const totalMem = Math.max(worker.resources.totalMemoryMb, 1);
      const usedMem = Math.max(worker.resources.usedMemoryMb, 0);
      const memoryRatio = Math.min(Math.max(usedMem / totalMem, 0), 1);

      const cpuUsage = Math.max(worker.resources.cpuUsagePercent, 0);
      const cpuRatio = Math.min(Math.max(cpuUsage / 100, 0), 1);

      const maxWorkloads = Math.max(worker.limits.maxConcurrentWorkloads, 1);
      const activeCont = Math.max(worker.resources.activeContainers, 0);
      const containerRatio = Math.min(Math.max(activeCont / maxWorkloads, 0), 1);

      const score = Number((0.4 * memoryRatio + 0.4 * cpuRatio + 0.2 * containerRatio).toFixed(4));

      const reasons: string[] = [];
      if (worker.state !== 'idle' && worker.state !== 'busy') {
        reasons.push(`State is '${worker.state}'`);
      }
      if (worker.resources.activeContainers >= worker.limits.maxConcurrentWorkloads) {
        reasons.push(
          `Concurrency full (${worker.resources.activeContainers}/${worker.limits.maxConcurrentWorkloads})`
        );
      }
      if (worker.resources.freeMemoryMb < requiredMemoryMb) {
        reasons.push(`Low memory (${worker.resources.freeMemoryMb}MB < ${requiredMemoryMb}MB)`);
      }

      return {
        workerId: worker.id,
        name: worker.name,
        score,
        memoryRatio: Number(memoryRatio.toFixed(4)),
        cpuRatio: Number(cpuRatio.toFixed(4)),
        containerRatio: Number(containerRatio.toFixed(4)),
        freeMemoryMb: worker.resources.freeMemoryMb,
        usedMemoryMb: worker.resources.usedMemoryMb,
        totalMemoryMb: worker.resources.totalMemoryMb,
        cpuUsagePercent: worker.resources.cpuUsagePercent,
        activeContainers: worker.resources.activeContainers,
        maxConcurrentWorkloads: worker.limits.maxConcurrentWorkloads,
        eligible: reasons.length === 0,
        rejectionReasons: reasons,
      };
    });
  }

  // Deployments
  getDeployments(applicationId?: string): Deployment[] {
    const list = Array.from(this.deployments.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return applicationId ? list.filter((d) => d.applicationId === applicationId) : list;
  }

  getDeployment(id: string): Deployment | undefined {
    return this.deployments.get(id);
  }

  createDeployment(input: {
    applicationId?: string;
    name: string;
    slug?: string;
    framework?: AppConfig['framework'];
    git: AppConfig['git'];
    port: number;
    env?: AppConfig['env'];
    resourceLimits?: AppConfig['resourceLimits'];
    workerId?: string;
  }): Deployment {
    let app = input.applicationId ? this.applications.get(input.applicationId) : undefined;
    if (!app) {
      const appId = input.applicationId || `app-${randomUUID().slice(0, 8)}`;
      app = {
        id: appId,
        name: input.name,
        slug: input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        framework: input.framework || 'dockerfile',
        git: input.git,
        port: input.port,
        env: input.env || [],
        replicas: 1,
        resourceLimits: input.resourceLimits || { cpuLimitCores: 1.0, memoryLimitMb: 512 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.applications.set(app.id, app);
    }

    // Pick best worker if not provided
    const scores = this.getWorkerScores(app.resourceLimits?.memoryLimitMb || 512);
    const eligibleScores = scores.filter((s) => s.eligible).sort((a, b) => a.score - b.score);
    const assignedWorkerId = input.workerId || eligibleScores[0]?.workerId || 'worker-node-local-01';
    const assignedWorker = this.workers.get(assignedWorkerId);

    const deploymentId = `dep-${randomUUID().slice(0, 8)}`;
    const port = 20000 + Math.floor(Math.random() * 1000);
    const newDep: Deployment = {
      id: deploymentId,
      applicationId: app.id,
      version: 1,
      gitCommitHash: input.git.commitHash || 'a1b2c3d',
      gitBranch: input.git.branch,
      state: 'running',
      workerId: assignedWorkerId,
      attemptId: `att-${Date.now().toString(36)}`,
      containerId: `cwc-cnt-${randomUUID().slice(0, 7)}`,
      assignedPort: port,
      publicUrl: `https://${app.slug}.trycloudflare.com`,
      workerUrl: assignedWorker ? `http://${assignedWorker.ipAddress}:${port}` : undefined,
      routingStatus: 'ready',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    };

    this.deployments.set(newDep.id, newDep);

    // Update worker container count and used memory
    if (assignedWorker) {
      const memMb = app.resourceLimits?.memoryLimitMb || 512;
      assignedWorker.resources.activeContainers += 1;
      assignedWorker.resources.usedMemoryMb = Math.min(
        assignedWorker.resources.totalMemoryMb,
        assignedWorker.resources.usedMemoryMb + memMb
      );
      assignedWorker.resources.freeMemoryMb = Math.max(
        0,
        assignedWorker.resources.totalMemoryMb - assignedWorker.resources.usedMemoryMb
      );
      this.workers.set(assignedWorker.id, assignedWorker);
    }

    // Seed log entry
    this.logs.set(newDep.id, [
      {
        id: '1',
        stream: 'system',
        level: 'info',
        message: `Deployment scheduled to worker '${assignedWorkerId}'`,
        timestamp: new Date().toISOString(),
      },
      {
        id: '2',
        stream: 'stdout',
        level: 'info',
        message: `Container started on port ${port}. Ingress active at ${newDep.publicUrl}`,
        timestamp: new Date().toISOString(),
      },
    ]);

    return newDep;
  }

  relocateDeployment(deploymentId: string, targetWorkerId: string): Deployment {
    const dep = this.deployments.get(deploymentId);
    if (!dep) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    const targetWorker = this.workers.get(targetWorkerId);
    if (!targetWorker) {
      throw new Error(`Target worker ${targetWorkerId} not found`);
    }

    const oldWorkerId = dep.workerId;
    dep.workerId = targetWorkerId;
    dep.attemptId = `att-${Date.now().toString(36)}`;
    dep.updatedAt = new Date().toISOString();
    dep.workerUrl = dep.assignedPort
      ? `http://${targetWorker.ipAddress}:${dep.assignedPort}`
      : undefined;

    // Adjust counts
    if (oldWorkerId && oldWorkerId !== targetWorkerId) {
      const oldWorker = this.workers.get(oldWorkerId);
      if (oldWorker && oldWorker.resources.activeContainers > 0) {
        oldWorker.resources.activeContainers -= 1;
        oldWorker.resources.usedMemoryMb = Math.max(0, oldWorker.resources.usedMemoryMb - 512);
        oldWorker.resources.freeMemoryMb =
          oldWorker.resources.totalMemoryMb - oldWorker.resources.usedMemoryMb;
        this.workers.set(oldWorker.id, oldWorker);
      }
    }

    targetWorker.resources.activeContainers += 1;
    targetWorker.resources.usedMemoryMb = Math.min(
      targetWorker.resources.totalMemoryMb,
      targetWorker.resources.usedMemoryMb + 512
    );
    targetWorker.resources.freeMemoryMb = Math.max(
      0,
      targetWorker.resources.totalMemoryMb - targetWorker.resources.usedMemoryMb
    );
    this.workers.set(targetWorker.id, targetWorker);

    this.deployments.set(dep.id, dep);
    return dep;
  }

  rebalance(strategy = 'balanced', dryRun = false): ClusterRebalanceResult {
    const workers = this.getWorkers();
    const deps = this.getDeployments().filter((d) => d.state === 'running');
    const apps = this.getApplications();

    // Compute stats
    const totalMem = workers.reduce((sum, w) => sum + w.resources.totalMemoryMb, 0);
    const totalAllocated = workers.reduce((sum, w) => sum + w.resources.usedMemoryMb, 0);
    const targetClusterRatio = totalMem > 0 ? (totalAllocated / totalMem) * 100 : 0;

    const workerStats: WorkerBalanceStat[] = workers.map((w) => {
      const ratio = w.resources.totalMemoryMb > 0 ? (w.resources.usedMemoryMb / w.resources.totalMemoryMb) * 100 : 0;
      return {
        workerId: w.id,
        workerName: w.name,
        totalMemoryMb: w.resources.totalMemoryMb,
        allocatedMemoryMb: w.resources.usedMemoryMb,
        activeContainers: w.resources.activeContainers,
        initialRatio: Number(ratio.toFixed(1)),
        projectedRatio: Number(ratio.toFixed(1)),
        isPrimaryTarget: false,
      };
    });

    const initialRatios = workerStats.map((s) => s.initialRatio);
    const minRatio = Math.min(...initialRatios);
    const maxRatio = Math.max(...initialRatios);
    const initialSkew = Number((maxRatio - minRatio).toFixed(1));

    const migrations: WorkloadMigrationPlan[] = [];

    // If skew > 15% and we have at least 2 workers, plan migrations
    if (initialSkew > 15 && workerStats.length >= 2 && deps.length > 0) {
      // Find highest loaded worker
      const overloaded = [...workerStats].sort((a, b) => b.initialRatio - a.initialRatio)[0];
      // Find lowest loaded worker
      const underloaded = [...workerStats].sort((a, b) => a.initialRatio - b.initialRatio)[0];

      if (overloaded && underloaded && overloaded.workerId !== underloaded.workerId) {
        underloaded.isPrimaryTarget = true;
        const depToMigrate = deps.find((d) => d.workerId === overloaded.workerId);
        if (depToMigrate) {
          const app = apps.find((a) => a.id === depToMigrate.applicationId);
          const mem = app?.resourceLimits?.memoryLimitMb || 512;
          const cpu = app?.resourceLimits?.cpuLimitCores || 1.0;

          migrations.push({
            deploymentId: depToMigrate.id,
            applicationId: depToMigrate.applicationId,
            applicationName: app?.name || 'Application Workload',
            sourceWorkerId: overloaded.workerId,
            sourceWorkerName: overloaded.workerName,
            targetWorkerId: underloaded.workerId,
            targetWorkerName: underloaded.workerName,
            memoryMb: mem,
            cpuCores: cpu,
          });

          // Update projected stats
          overloaded.projectedRatio = Number(
            (
              ((overloaded.allocatedMemoryMb - mem) / overloaded.totalMemoryMb) *
              100
            ).toFixed(1)
          );
          underloaded.projectedRatio = Number(
            (
              ((underloaded.allocatedMemoryMb + mem) / underloaded.totalMemoryMb) *
              100
            ).toFixed(1)
          );

          if (!dryRun) {
            this.relocateDeployment(depToMigrate.id, underloaded.workerId);
          }
        }
      }
    }

    const projectedRatios = workerStats.map((s) => s.projectedRatio);
    const projMin = Math.min(...projectedRatios);
    const projMax = Math.max(...projectedRatios);
    const projectedSkew = Number((projMax - projMin).toFixed(1));

    return {
      balanced: migrations.length === 0 || projectedSkew < initialSkew,
      initialSkewPercent: initialSkew,
      projectedSkewPercent: projectedSkew,
      targetClusterRatioPercent: Number(targetClusterRatio.toFixed(1)),
      migrations,
      workerStats,
      dryRun,
      executedAt: new Date().toISOString(),
    };
  }

  // Applications
  getApplications(): AppConfig[] {
    return Array.from(this.applications.values());
  }

  // Logs
  getLogs(deploymentId: string): DeploymentLogEntry[] {
    return this.logs.get(deploymentId) || [];
  }
}

export const memoryStore = new MemoryStore();
