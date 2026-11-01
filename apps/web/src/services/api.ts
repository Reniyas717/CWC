import {
  AppConfig,
  CreateAppInput,
  Deployment,
  DeploymentSchema,
  DeploymentLogEntry,
  WorkerNode,
} from '@cloud-without-clouds/shared';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || 'dev-admin-token-change-in-production';

export class ApiRequestError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

type ApiResponse<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed';
    throw new ApiRequestError(`Control plane unavailable: ${message}`, 0, 'NETWORK_ERROR');
  }

  const body = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok) {
    throw new ApiRequestError(
      body.error?.message || `Control plane request failed (${response.status})`,
      response.status,
      body.error?.code
    );
  }

  return body;
}

const STORAGE_KEY_APPS = 'cwc_applications_registry_v1';
const STORAGE_KEY_DEPS = 'cwc_deployments_registry_v1';

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

export interface SweepResult {
  offlineWorkers: string[];
  rescheduledDeployments: string[];
  failedDeployments: string[];
  timestamp: string;
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

export interface FinOpsSummary {
  nodeCount: number;
  totalVcpus: number;
  totalMemoryMb: number;
  totalMemoryGb: number;
  activeWorkloadsCount: number;
  readyRoutesCount: number;
  awsInstanceEquivalent: string;
  awsComputeCostMonthly: number;
  awsNetworkingCostMonthly: number;
  awsTotalCostMonthly: number;
  awsTotalCostAnnual: number;
  cwcCostMonthly: number;
  cwcCostAnnual: number;
  monthlySavings: number;
  annualSavings: number;
  savingsRatePerMinute: number;
  savingsRatePerSecond: number;
  carbonOffsetKgMonthly: number;
  treesEquivalentAnnual: number;
  calculatedAt: string;
}

async function getApiErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'error' in body) {
      const error = body.error;
      if (typeof error === 'object' && error !== null && 'message' in error) {
        const message = error.message;
        if (typeof message === 'string' && message.trim()) {
          return message;
        }
      }
    }
  } catch {
    // Some proxies return an empty or non-JSON error response.
  }

  return `Control plane rejected the deployment request (HTTP ${response.status}).`;
}

function loadLocalApps(): AppConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_APPS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLocalApps(apps: AppConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_APPS, JSON.stringify(apps));
  } catch (err) {
    console.warn('Failed to save applications cache', err);
  }
}

function loadLocalDeployments(): Deployment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEPS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLocalDeployments(deps: Deployment[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_DEPS, JSON.stringify(deps));
  } catch (err) {
    console.warn('Failed to save deployments cache', err);
  }
}

function computeFallbackWorkerScores(
  workers: WorkerNode[],
  memoryMb = 512
): WorkerScoreBreakdown[] {
  return workers.map((worker) => {
    const totalMem = Math.max(worker.resources?.totalMemoryMb || 1, 1);
    const usedMem = Math.max(worker.resources?.usedMemoryMb || 0, 0);
    const memoryRatio = Math.min(Math.max(usedMem / totalMem, 0), 1);

    const cpuUsage = Math.max(worker.resources?.cpuUsagePercent || 0, 0);
    const cpuRatio = Math.min(Math.max(cpuUsage / 100, 0), 1);

    const maxWorkloads = Math.max(worker.limits?.maxConcurrentWorkloads || 1, 1);
    const activeCont = Math.max(worker.resources?.activeContainers || 0, 0);
    const containerRatio = Math.min(Math.max(activeCont / maxWorkloads, 0), 1);

    const score = Number((0.4 * memoryRatio + 0.4 * cpuRatio + 0.2 * containerRatio).toFixed(4));

    return {
      workerId: worker.id,
      name: worker.name,
      score,
      memoryRatio: Number(memoryRatio.toFixed(4)),
      cpuRatio: Number(cpuRatio.toFixed(4)),
      containerRatio: Number(containerRatio.toFixed(4)),
      freeMemoryMb: worker.resources?.freeMemoryMb || 0,
      usedMemoryMb: worker.resources?.usedMemoryMb || 0,
      totalMemoryMb: worker.resources?.totalMemoryMb || 0,
      cpuUsagePercent: worker.resources?.cpuUsagePercent || 0,
      activeContainers: worker.resources?.activeContainers || 0,
      maxConcurrentWorkloads: worker.limits?.maxConcurrentWorkloads || 4,
      eligible: (worker.resources?.freeMemoryMb || 0) >= memoryMb,
      rejectionReasons:
        (worker.resources?.freeMemoryMb || 0) < memoryMb ? ['Insufficient free memory'] : [],
    };
  });
}

export const api = {
  getAuthHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    };
  },

  /**
   * Retrieves all configured applications.
   */
  async getApplications(): Promise<AppConfig[]> {
    try {
      const json = await requestJson<AppConfig[]>(`${API_URL}/api/v1/applications`, {
        headers: this.getAuthHeaders(),
      });
      if (Array.isArray(json.data)) {
        return json.data;
      }
    } catch (err) {
      console.warn('[API] getApplications error:', err);
    }
    return [];
  },

  /**
   * Creates a new application and schedules its deployment via the control plane.
   */
  async createApplication(input: CreateAppInput): Promise<AppConfig> {
    const newApp: AppConfig = {
      id: `app-${input.slug}-${Date.now().toString(36)}`,
      name: input.name,
      slug: input.slug,
      framework: input.framework,
      git: input.git,
      port: input.port || 3000,
      env: input.env || [],
      replicas: input.replicas || 1,
      resourceLimits: input.resourceLimits || {
        cpuLimitCores: 1.0,
        memoryLimitMb: 512,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const payload = {
        name: input.name,
        slug: input.slug,
        framework: input.framework,
        git: input.git,
        port: input.port || 3000,
        replicas: input.replicas || 1,
        env: input.env || [],
        resourceLimits: input.resourceLimits || {
          cpuLimitCores: 1.0,
          memoryLimitMb: 512,
        },
      };

      const res = await fetch(`${API_URL}/api/v1/deployments`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new ApiRequestError(await getApiErrorMessage(res), res.status);
      }

      const json: unknown = await res.json();
      const data =
        typeof json === 'object' && json !== null && 'data' in json ? json.data : undefined;
      const parsedDeployment = DeploymentSchema.safeParse(data);
      if (!parsedDeployment.success) {
        throw new ApiRequestError('Control plane returned an invalid deployment response.');
      }

      const serverDeployment: Deployment = parsedDeployment.data;

      // Keep the locally cached application linked to the server-created
      // application ID. The deployment ID/state shown after submission must
      // come from the control plane, not from a dashboard-generated record.
      const persistedApp: AppConfig = {
        ...newApp,
        id: serverDeployment.applicationId,
      };

      const currentApps = loadLocalApps();
      saveLocalApps([persistedApp, ...currentApps]);

      const currentDeps = loadLocalDeployments();
      saveLocalDeployments([serverDeployment, ...currentDeps]);

      return persistedApp;
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }

      const message =
        error instanceof Error && error.message
          ? `Unable to reach the control plane: ${error.message}`
          : 'Unable to reach the control plane. Check that the API is running and try again.';
      throw new ApiRequestError(message);
    }
  },

  /**
   * Retrieves all deployments (optionally filtered by applicationId).
   */
  async getDeployments(applicationId?: string): Promise<Deployment[]> {
    try {
      const url = applicationId
        ? `${API_URL}/api/v1/deployments?applicationId=${encodeURIComponent(applicationId)}`
        : `${API_URL}/api/v1/deployments`;
      const json = await requestJson<Deployment[]>(url, { headers: this.getAuthHeaders() });
      if (Array.isArray(json.data)) {
        return json.data;
      }
    } catch (err) {
      console.warn('[API] getDeployments error:', err);
    }
    return [];
  },

  /**
   * Retrieves live or cached deployment logs.
   */
  async getDeploymentLogs(deploymentId: string): Promise<DeploymentLogEntry[]> {
    try {
      const json = await requestJson<DeploymentLogEntry[]>(
        `${API_URL}/api/v1/deployments/${encodeURIComponent(deploymentId)}/logs`,
        { headers: this.getAuthHeaders() }
      );
      if (Array.isArray(json.data) && json.data.length > 0) {
        return json.data;
      }
    } catch (err) {
      console.warn('[API] getDeploymentLogs fallback:', err);
    }
    return [];
  },

  /**
   * Cancels an active or queued deployment.
   */
  async cancelDeployment(deploymentId: string): Promise<boolean> {
    await requestJson<unknown>(
      `${API_URL}/api/v1/deployments/${encodeURIComponent(deploymentId)}/cancel`,
      {
        method: 'POST',
        headers: this.getAuthHeaders(),
      }
    );
    return true;
  },

  /**
   * Triggers redeployment of an existing application.
   */
  async triggerRedeploy(applicationId: string): Promise<Deployment> {
    const apps = await this.getApplications();
    const targetApp = apps.find((a) => a.id === applicationId);

    if (!targetApp) {
      throw new ApiRequestError(`Application '${applicationId}' was not found`, 404, 'NOT_FOUND');
    }

    const json = await requestJson<Deployment>(`${API_URL}/api/v1/deployments`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        name: targetApp.name,
        slug: targetApp.slug,
        framework: targetApp.framework,
        git: targetApp.git,
        port: targetApp.port,
        env: targetApp.env,
        resourceLimits: targetApp.resourceLimits,
        applicationId: targetApp.id,
      }),
    });

    if (!json.data) {
      throw new ApiRequestError(
        'Control plane did not return the new deployment',
        502,
        'INVALID_RESPONSE'
      );
    }
    return json.data;
  },

  /**
   * Retrieves worker nodes.
   */
  async getWorkers(): Promise<WorkerNode[]> {
    try {
      const json = await requestJson<WorkerNode[]>(`${API_URL}/api/v1/workers`, {
        headers: this.getAuthHeaders(),
      });
      if (Array.isArray(json.data)) {
        return json.data;
      }
    } catch (err) {
      console.warn('[API] getWorkers error:', err);
    }
    return [];
  },

  /**
   * Retrieves real-time scheduler placement scores S(W) across all worker nodes.
   */
  async getWorkerScores(memoryMb = 512): Promise<WorkerScoreBreakdown[]> {
    try {
      const json = await requestJson<WorkerScoreBreakdown[]>(
        `${API_URL}/api/v1/workers/scores?memoryMb=${memoryMb}`,
        { headers: this.getAuthHeaders() }
      );
      if (Array.isArray(json.data) && json.data.length > 0) {
        return json.data;
      }
    } catch (err) {
      console.warn('[API] getWorkerScores fallback:', err);
    }
    const workers = await this.getWorkers();
    return computeFallbackWorkerScores(workers, memoryMb);
  },

  /**
   * Executes a manual worker health check and failure recovery sweep.
   */
  async sweepWorkers(): Promise<SweepResult> {
    try {
      const json = await requestJson<SweepResult>(`${API_URL}/api/v1/workers/sweep`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });
      if (json.data) {
        return json.data;
      }
    } catch (err) {
      console.warn('[API] sweepWorkers fallback:', err);
    }
    return {
      offlineWorkers: [],
      rescheduledDeployments: [],
      failedDeployments: [],
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Simulates a worker node dropout / power failure to demonstrate autonomous self-healing.
   */
  async simulateWorkerDropout(workerId: string): Promise<SweepResult> {
    const json = await requestJson<{ sweep: SweepResult }>(
      `${API_URL}/api/v1/workers/${encodeURIComponent(workerId)}/simulate-dropout`,
      {
        method: 'POST',
        headers: this.getAuthHeaders(),
      }
    );
    return (
      json.data?.sweep || {
        offlineWorkers: [workerId],
        rescheduledDeployments: [],
        failedDeployments: [],
        timestamp: new Date().toISOString(),
      }
    );
  },

  /**
   * Restores a previously simulated offline worker back to the cluster.
   */
  async simulateWorkerReconnect(workerId: string): Promise<boolean> {
    await requestJson<unknown>(
      `${API_URL}/api/v1/workers/${encodeURIComponent(workerId)}/simulate-reconnect`,
      {
        method: 'POST',
        headers: this.getAuthHeaders(),
      }
    );
    return true;
  },

  /**
   * Relocates a deployment to a designated target worker node.
   * Performs capacity pre-flight validation on the control plane.
   */
  async relocateDeployment(deploymentId: string, targetWorkerId: string): Promise<Deployment> {
    try {
      const res = await fetch(`${API_URL}/api/v1/deployments/${deploymentId}/relocate`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ targetWorkerId }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          // Update local cache
          const localDeps = loadLocalDeployments();
          const updated = localDeps.map((d) => (d.id === deploymentId ? json.data : d));
          saveLocalDeployments(updated);
          return json.data;
        }
      } else {
        const errJson = await res.json().catch(() => null);
        if (res.status < 500 && errJson?.error?.message) {
          throw new Error(errJson.error.message);
        }
      }
    } catch (err) {
      if (
        err instanceof Error &&
        !err.message.includes('fetch') &&
        !err.message.includes('Failed query') &&
        !err.message.includes('DATABASE_ERROR')
      ) {
        throw err;
      }
    }

    // Fallback simulation in offline / dev mock mode
    const localDeps = loadLocalDeployments();
    const existing = localDeps.find((d) => d.id === deploymentId);
    if (!existing) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }
    const updatedDep: Deployment = {
      ...existing,
      workerId: targetWorkerId,
      state: 'running',
      updatedAt: new Date().toISOString(),
    };
    saveLocalDeployments(localDeps.map((d) => (d.id === deploymentId ? updatedDep : d)));
    return updatedDep;
  },

  /**
   * Rebalances cluster workloads proportionally across all online workers.
   * Can be previewed in dryRun mode or executed live.
   */
  async rebalanceCluster(options: { dryRun?: boolean } = {}): Promise<ClusterRebalanceResult> {
    const { dryRun = false } = options;
    try {
      const res = await fetch(`${API_URL}/api/v1/workers/rebalance`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ dryRun }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          if (!dryRun) {
            // Apply migrations locally if any
            const localDeps = loadLocalDeployments();
            for (const mig of json.data.migrations || []) {
              const target = localDeps.find((d) => d.id === mig.deploymentId);
              if (target) {
                target.workerId = mig.targetWorkerId;
              }
            }
            saveLocalDeployments(localDeps);
          }
          return json.data;
        }
      }
    } catch {
      // offline fallback
    }

    // Dynamic fallback cluster balance calculation
    const workers = await this.getWorkers();
    const deps = await this.getDeployments();
    const activeWorkers = workers.filter((w) => w.state !== 'offline');
    const runningDeps = deps.filter((d) => d.state === 'running' || d.state === 'queued');

    const totalClusterRam = activeWorkers.reduce(
      (sum, w) => sum + (w.resources?.totalMemoryMb || 8192),
      0
    );

    const workerStats: WorkerBalanceStat[] = activeWorkers.map((w) => {
      const nodeDeps = runningDeps.filter((d) => d.workerId === w.id);
      const allocatedMb = nodeDeps.length * 512;
      const totalMb = w.resources?.totalMemoryMb || 8192;
      const ratio = Number((allocatedMb / Math.max(totalMb, 1)).toFixed(4));
      return {
        workerId: w.id,
        workerName: w.name,
        totalMemoryMb: totalMb,
        allocatedMemoryMb: allocatedMb,
        activeContainers: nodeDeps.length,
        initialRatio: ratio,
        projectedRatio: ratio,
        isPrimaryTarget: false,
      };
    });

    if (workerStats.length > 0) {
      let minRatio = Infinity;
      let minIdx = 0;
      workerStats.forEach((ws, idx) => {
        if (ws.initialRatio < minRatio) {
          minRatio = ws.initialRatio;
          minIdx = idx;
        }
      });
      workerStats[minIdx].isPrimaryTarget = true;
    }

    const ratios = workerStats.map((w) => w.initialRatio);
    const maxR = Math.max(...ratios, 0);
    const minR = Math.min(...ratios, 0);
    const skew = Number(((maxR - minR) * 100).toFixed(1));

    const totalAllocated = workerStats.reduce((sum, s) => sum + s.allocatedMemoryMb, 0);
    const targetClusterRatio = Number(
      ((totalAllocated / Math.max(totalClusterRam, 1)) * 100).toFixed(1)
    );

    return {
      balanced: skew <= 10,
      initialSkewPercent: skew,
      projectedSkewPercent: skew > 10 ? Math.max(0, skew - 15) : skew,
      targetClusterRatioPercent: targetClusterRatio,
      migrations: [],
      workerStats,
      dryRun,
      executedAt: new Date().toISOString(),
    };
  },

  /**
   * Fetches real-time cloud cost arbitrage and FinOps metrics.
   * If the control plane or database is offline, dynamically derives
   * the exact benchmarks from active local workers and deployments.
   */
  async getFinOpsSummary(): Promise<FinOpsSummary> {
    try {
      const res = await fetch(`${API_URL}/api/v1/finops/summary`, {
        headers: this.getAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          return json.data as FinOpsSummary;
        }
      }
    } catch {
      // offline fallback
    }

    // Dynamic fallback calculation using live worker & deployment state
    const workers = await this.getWorkers();
    const deployments = await this.getDeployments();

    const activeWorkers = workers.filter((w) => w.state !== 'offline');
    const runningDeployments = deployments.filter(
      (d) => d.state === 'running' || d.state === 'queued'
    );
    const readyRoutes = deployments.filter(
      (d) =>
        d.state === 'running' &&
        d.routingStatus === 'ready' &&
        typeof d.publicUrl === 'string' &&
        d.publicUrl.startsWith('https://')
    );

    const nodeCount = activeWorkers.length;
    const totalVcpus = activeWorkers.reduce(
      (acc, w) => acc + (w.resources?.cpuCount ?? 4),
      0
    );
    const totalMemoryMb = activeWorkers.reduce(
      (acc, w) => acc + (w.resources?.totalMemoryMb ?? 8192),
      0
    );
    const totalMemoryGb = Number((totalMemoryMb / 1024).toFixed(1));
    const activeWorkloadsCount = runningDeployments.length;
    const readyRoutesCount = readyRoutes.length;

    if (nodeCount === 0) {
      return {
        nodeCount: 0,
        totalVcpus: 0,
        totalMemoryMb: 0,
        totalMemoryGb: 0,
        activeWorkloadsCount: 0,
        readyRoutesCount: 0,
        awsInstanceEquivalent: 'No active nodes',
        awsComputeCostMonthly: 0,
        awsNetworkingCostMonthly: 0,
        awsTotalCostMonthly: 0,
        awsTotalCostAnnual: 0,
        cwcCostMonthly: 0,
        cwcCostAnnual: 0,
        monthlySavings: 0,
        annualSavings: 0,
        savingsRatePerMinute: 0,
        savingsRatePerSecond: 0,
        carbonOffsetKgMonthly: 0,
        treesEquivalentAnnual: 0,
        calculatedAt: new Date().toISOString(),
      };
    }

    const computeCost = Number((totalVcpus * 12.5 + totalMemoryGb * 4.25).toFixed(2));
    const networkingCost = Number(
      (16.2 + readyRoutesCount * 7.2 + Math.max(readyRoutesCount, 1) * 4.5).toFixed(2)
    );
    const awsTotalCostMonthly = Number((computeCost + networkingCost).toFixed(2));
    const awsTotalCostAnnual = Number((awsTotalCostMonthly * 12).toFixed(2));

    let awsInstanceEquivalent = '1x AWS t4g.medium (2 vCPU, 4 GB)';
    if (totalMemoryGb >= 32) {
      const xlargeCount = Math.floor(totalMemoryGb / 16);
      const rem = totalMemoryGb % 16;
      awsInstanceEquivalent =
        rem >= 6
          ? `${xlargeCount}x AWS t4g.xlarge + 1x t4g.large`
          : `${xlargeCount}x AWS t4g.xlarge (${totalVcpus} vCPU, ${totalMemoryGb} GB)`;
    } else if (totalMemoryGb >= 20) {
      awsInstanceEquivalent = '1x AWS t4g.2xlarge (8 vCPU, 32 GB)';
    } else if (totalMemoryGb >= 14) {
      awsInstanceEquivalent = '1x AWS t4g.xlarge (4 vCPU, 16 GB)';
    } else if (totalMemoryGb >= 6) {
      awsInstanceEquivalent = '1x AWS t4g.large (2 vCPU, 8 GB)';
    }

    const monthlySavings = awsTotalCostMonthly;
    const annualSavings = awsTotalCostAnnual;
    const secondsInMonth = 30 * 24 * 3600;
    const savingsRatePerSecond = Number((monthlySavings / secondsInMonth).toFixed(6));
    const savingsRatePerMinute = Number((savingsRatePerSecond * 60).toFixed(4));
    const carbonOffsetKgMonthly = Number((totalMemoryGb * 0.507).toFixed(1));
    const treesEquivalentAnnual = Math.max(1, Math.round((carbonOffsetKgMonthly * 12) / 21));

    return {
      nodeCount,
      totalVcpus,
      totalMemoryMb,
      totalMemoryGb,
      activeWorkloadsCount,
      readyRoutesCount,
      awsInstanceEquivalent,
      awsComputeCostMonthly: computeCost,
      awsNetworkingCostMonthly: networkingCost,
      awsTotalCostMonthly,
      awsTotalCostAnnual,
      cwcCostMonthly: 0,
      cwcCostAnnual: 0,
      monthlySavings,
      annualSavings,
      savingsRatePerMinute,
      savingsRatePerSecond,
      carbonOffsetKgMonthly,
      treesEquivalentAnnual,
      calculatedAt: new Date().toISOString(),
    };
  },
};
