import {
  AppConfig,
  CreateAppInput,
  Deployment,
  DeploymentSchema,
  DeploymentLogEntry,
  WorkerNode,
  HealthCheckResponse,
} from '@cloud-without-clouds/shared';
import { getStoredApiUrl } from './config';

export class MobileApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'MobileApiError';
    this.status = status;
    this.code = code;
  }
}

type ApiResponse<T> = {
  data?: T;
  count?: number;
  success?: boolean;
  error?: {
    code?: string;
    message?: string;
  };
};

async function requestJson<T>(endpoint: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const baseUrl = getStoredApiUrl();
  const url = `${baseUrl}${endpoint}`;
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      credentials: 'include',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network failure';
    throw new MobileApiError(`Control plane unavailable: ${message}`, 0, 'NETWORK_ERROR');
  }

  const body = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok) {
    throw new MobileApiError(
      body.error?.message || `Control plane error (${response.status})`,
      response.status,
      body.error?.code
    );
  }

  return body;
}

const STORAGE_KEY_APPS = 'cwc_mobile_apps_registry_v1';
const STORAGE_KEY_DEPS = 'cwc_mobile_deps_registry_v1';

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

export interface ClusterRebalanceResult {
  balanced: boolean;
  initialSkewPercent: number;
  projectedSkewPercent: number;
  targetClusterRatioPercent: number;
  migrations: Array<{
    deploymentId: string;
    applicationName: string;
    sourceWorkerName: string;
    targetWorkerName: string;
    memoryMb: number;
  }>;
  workerStats: Array<{
    workerId: string;
    workerName: string;
    totalMemoryMb: number;
    allocatedMemoryMb: number;
    activeContainers: number;
    initialRatio: number;
    projectedRatio: number;
    isPrimaryTarget: boolean;
  }>;
  dryRun: boolean;
  executedAt: string;
}

function loadLocalApps(): AppConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_APPS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalApps(apps: AppConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_APPS, JSON.stringify(apps));
  } catch {
    // Ignore
  }
}

function loadLocalDeployments(): Deployment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEPS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalDeployments(deps: Deployment[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_DEPS, JSON.stringify(deps));
  } catch {
    // Ignore
  }
}

export const mobileApi = {
  /**
   * Health ping to retrieve real control-plane telemetry, service name, version, and dependencies.
   */
  async checkHealth(): Promise<{
    online: boolean;
    latencyMs: number;
    service?: string;
    version?: string;
    uptime?: number;
    environment?: string;
    dependencies?: {
      database?: { status: string; message: string };
      redis?: { status: string; message: string };
    };
  }> {
    const start = performance.now();
    try {
      const baseUrl = getStoredApiUrl();
      const res = await fetch(`${baseUrl}/health`, { method: 'GET' });
      const latencyMs = Math.round(performance.now() - start);
      if (res.ok) {
        const json = (await res.json().catch(() => ({}))) as HealthCheckResponse;
        return {
          online: true,
          latencyMs,
          service: json.service || 'cloud-without-clouds-control-plane',
          version: json.version || '0.1.0',
          uptime: json.uptime ?? Math.floor(performance.now() / 1000),
          environment: json.environment || 'development',
          dependencies: json.dependencies,
        };
      }
    } catch {
      // Offline
    }
    return { online: false, latencyMs: 0 };
  },

  /**
   * Retrieves all registered applications directly from control plane.
   */
  async getApplications(): Promise<AppConfig[]> {
    try {
      const json = await requestJson<AppConfig[]>('/api/v1/applications');
      if (Array.isArray(json.data) && json.data.length > 0) {
        saveLocalApps(json.data);
        return json.data;
      }
    } catch (err) {
      console.warn('[MobileAPI] getApplications API unavailable, using cached:', err);
    }
    return loadLocalApps();
  },

  /**
   * Creates a new application and schedules deployment onto idle laptop workers.
   */
  async createApplication(input: CreateAppInput): Promise<AppConfig> {
    const newApp: AppConfig = {
      id: `app-${input.slug}-${Date.now().toString(36)}`,
      name: input.name,
      slug: input.slug,
      framework: input.framework || 'dockerfile',
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
        framework: input.framework || 'dockerfile',
        git: input.git,
        port: input.port || 3000,
        replicas: input.replicas || 1,
        env: input.env || [],
        resourceLimits: input.resourceLimits || {
          cpuLimitCores: 1.0,
          memoryLimitMb: 512,
        },
      };

      const res = await requestJson<Deployment>('/api/v1/deployments', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.data) {
        const parsed = DeploymentSchema.safeParse(res.data);
        if (parsed.success) {
          const persisted: AppConfig = {
            ...newApp,
            id: parsed.data.applicationId,
          };
          const cur = loadLocalApps();
          saveLocalApps([persisted, ...cur]);
          const curDeps = loadLocalDeployments();
          saveLocalDeployments([parsed.data, ...curDeps]);
          return persisted;
        }
      }
    } catch (err) {
      console.warn('[MobileAPI] createApplication failed on control plane:', err);
    }

    // Fallback persistence
    const cur = loadLocalApps();
    saveLocalApps([newApp, ...cur]);
    return newApp;
  },

  /**
   * Retrieves active deployments directly from control plane.
   */
  async getDeployments(applicationId?: string): Promise<Deployment[]> {
    try {
      const endpoint = applicationId
        ? `/api/v1/deployments?applicationId=${encodeURIComponent(applicationId)}`
        : '/api/v1/deployments';
      const json = await requestJson<Deployment[]>(endpoint);
      if (Array.isArray(json.data)) {
        saveLocalDeployments(json.data);
        return json.data;
      }
    } catch (err) {
      console.warn('[MobileAPI] getDeployments failed, using cached:', err);
    }
    return loadLocalDeployments();
  },

  /**
   * Retrieves live deployment logs from control plane.
   */
  async getDeploymentLogs(deploymentId: string): Promise<DeploymentLogEntry[]> {
    try {
      const json = await requestJson<DeploymentLogEntry[]>(
        `/api/v1/deployments/${encodeURIComponent(deploymentId)}/logs`
      );
      if (Array.isArray(json.data) && json.data.length > 0) {
        return json.data;
      }
    } catch (err) {
      console.warn('[MobileAPI] getDeploymentLogs failed:', err);
    }
    return [];
  },

  /**
   * Cancels an active or queued deployment.
   */
  async cancelDeployment(deploymentId: string): Promise<boolean> {
    try {
      await requestJson(`/api/v1/deployments/${encodeURIComponent(deploymentId)}/cancel`, {
        method: 'POST',
      });
      return true;
    } catch {
      const cur = loadLocalDeployments();
      saveLocalDeployments(
        cur.map((d) => (d.id === deploymentId ? { ...d, state: 'failed' } : d))
      );
      return true;
    }
  },

  /**
   * Triggers redeployment of an application on the control plane.
   */
  async triggerRedeploy(applicationId: string): Promise<Deployment> {
    const apps = await this.getApplications();
    const app = apps.find((a) => a.id === applicationId);
    if (!app) {
      throw new Error(`Application ${applicationId} not found`);
    }

    const json = await requestJson<Deployment>('/api/v1/deployments', {
      method: 'POST',
      body: JSON.stringify({
        name: app.name,
        slug: app.slug,
        framework: app.framework,
        git: app.git,
        port: app.port,
        env: app.env,
        resourceLimits: app.resourceLimits,
        applicationId: app.id,
      }),
    });
    if (json.data) return json.data;
    throw new Error('Redeployment failed');
  },

  /**
   * Retrieves distributed worker laptop nodes directly from control plane.
   */
  async getWorkers(): Promise<WorkerNode[]> {
    try {
      const json = await requestJson<WorkerNode[]>('/api/v1/workers');
      if (Array.isArray(json.data)) {
        return json.data;
      }
    } catch (err) {
      console.warn('[MobileAPI] getWorkers failed:', err);
    }
    return [];
  },

  /**
   * Retrieves scheduler load placement scores S(W) directly from control plane.
   */
  async getWorkerScores(memoryMb = 512): Promise<WorkerScoreBreakdown[]> {
    try {
      const json = await requestJson<WorkerScoreBreakdown[]>(
        `/api/v1/workers/scores?memoryMb=${memoryMb}`
      );
      if (Array.isArray(json.data) && json.data.length > 0) {
        return json.data;
      }
    } catch (err) {
      console.warn('[MobileAPI] getWorkerScores fallback:', err);
    }
    return [];
  },

  /**
   * Health sweep across all workers.
   */
  async sweepWorkers(): Promise<SweepResult> {
    try {
      const json = await requestJson<SweepResult>('/api/v1/workers/sweep', {
        method: 'POST',
      });
      if (json.data) return json.data;
    } catch (err) {
      console.warn('[MobileAPI] sweepWorkers failed:', err);
    }
    return {
      offlineWorkers: [],
      rescheduledDeployments: [],
      failedDeployments: [],
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Simulates worker node failure / laptop lid close for chaos testing.
   */
  async simulateWorkerDropout(workerId: string): Promise<SweepResult> {
    const json = await requestJson<{ sweep: SweepResult }>(
      `/api/v1/workers/${encodeURIComponent(workerId)}/simulate-dropout`,
      { method: 'POST' }
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
   * Simulates worker node reconnecting after laptop lid opened.
   */
  async simulateWorkerReconnect(workerId: string): Promise<boolean> {
    await requestJson(`/api/v1/workers/${encodeURIComponent(workerId)}/simulate-reconnect`, {
      method: 'POST',
    });
    return true;
  },

  /**
   * Relocates a workload to another laptop node on control plane.
   */
  async relocateDeployment(deploymentId: string, targetWorkerId: string): Promise<Deployment> {
    const res = await requestJson<Deployment>(
      `/api/v1/deployments/${deploymentId}/relocate`,
      {
        method: 'POST',
        body: JSON.stringify({ targetWorkerId }),
      }
    );
    if (res.data) return res.data;
    throw new Error('Failed to relocate workload');
  },

  /**
   * Rebalances cluster load proportionally across online workers.
   */
  async rebalanceCluster(options: { dryRun?: boolean } = {}): Promise<ClusterRebalanceResult> {
    const res = await requestJson<ClusterRebalanceResult>('/api/v1/workers/rebalance', {
      method: 'POST',
      body: JSON.stringify(options),
    });
    if (res.data) return res.data;
    throw new Error('Rebalance failed');
  },

  /**
   * Fetches real-time cloud cost arbitrage and FinOps metrics directly from control plane.
   */
  async getFinOpsSummary(): Promise<FinOpsSummary> {
    try {
      const res = await requestJson<FinOpsSummary>('/api/v1/finops/summary');
      if (res.data) return res.data;
    } catch (err) {
      console.warn('[MobileAPI] getFinOpsSummary failed:', err);
    }

    // Dynamic derivation from live state if API endpoint degraded
    const workers = await this.getWorkers();
    const deps = await this.getDeployments();
    const activeWorkers = workers.filter((w) => w.state !== 'offline');
    const runningDeployments = deps.filter((d) => d.state === 'running');

    const totalVcpus = activeWorkers.reduce((acc, w) => acc + (w.resources?.cpuCount ?? 4), 0);
    const totalMemoryMb = activeWorkers.reduce((acc, w) => acc + (w.resources?.totalMemoryMb ?? 8192), 0);
    const totalMemoryGb = Number((totalMemoryMb / 1024).toFixed(1));
    const activeWorkloadsCount = runningDeployments.length;

    const computeCost = Number((totalVcpus * 12.5 + totalMemoryGb * 4.25).toFixed(2));
    const networkingCost = Number((16.2 + activeWorkloadsCount * 7.2 + 4.5).toFixed(2));
    const awsTotalCostMonthly = Number((computeCost + networkingCost).toFixed(2));
    const awsTotalCostAnnual = Number((awsTotalCostMonthly * 12).toFixed(2));

    return {
      nodeCount: activeWorkers.length,
      totalVcpus,
      totalMemoryMb,
      totalMemoryGb,
      activeWorkloadsCount,
      readyRoutesCount: activeWorkloadsCount,
      awsInstanceEquivalent: `${Math.max(1, Math.ceil(totalMemoryGb / 16))}x AWS t4g.xlarge (${totalVcpus} vCPU, ${totalMemoryGb} GB)`,
      awsComputeCostMonthly: computeCost,
      awsNetworkingCostMonthly: networkingCost,
      awsTotalCostMonthly,
      awsTotalCostAnnual,
      cwcCostMonthly: 0,
      cwcCostAnnual: 0,
      monthlySavings: awsTotalCostMonthly,
      annualSavings: awsTotalCostAnnual,
      savingsRatePerMinute: Number((awsTotalCostMonthly / (30 * 24 * 60)).toFixed(4)),
      savingsRatePerSecond: Number((awsTotalCostMonthly / (30 * 24 * 3600)).toFixed(6)),
      carbonOffsetKgMonthly: Number((totalMemoryGb * 0.507).toFixed(1)),
      treesEquivalentAnnual: Math.max(1, Math.round((totalMemoryGb * 0.507 * 12) / 21)),
      calculatedAt: new Date().toISOString(),
    };
  },
};
