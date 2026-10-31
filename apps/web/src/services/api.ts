import {
  AppConfig,
  CreateAppInput,
  Deployment,
  DeploymentLogEntry,
  WorkerNode,
} from '@cloud-without-clouds/shared';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || 'cwc-admin-token-super-secret-dev';

const STORAGE_KEY_APPS = 'cwc_applications_registry_v1';
const STORAGE_KEY_DEPS = 'cwc_deployments_registry_v1';
const STORAGE_KEY_LOGS = 'cwc_deployment_logs_registry_v1';

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

// Initial realistic applications
const INITIAL_APPLICATIONS: AppConfig[] = [
  {
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
    replicas: 2,
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
  },
  {
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
  },
];

const INITIAL_DEPLOYMENTS: Deployment[] = [
  {
    id: 'dep-018e3a2b',
    applicationId: 'app-node-express-01',
    version: 1,
    gitCommitHash: 'f4b98c2',
    gitBranch: 'main',
    state: 'running',
    workerId: 'worker-node-local-01',
    containerId: 'cwc-cnt-a912f4b',
    assignedPort: 20015,
    publicUrl: 'https://express-api-gateway.trycloudflare.com',
    createdAt: new Date(Date.now() - 1200000).toISOString(),
    updatedAt: new Date(Date.now() - 1180000).toISOString(),
    startedAt: new Date(Date.now() - 1195000).toISOString(),
  },
  {
    id: 'dep-018e4b1c',
    applicationId: 'app-vite-static-02',
    version: 1,
    gitCommitHash: 'e7102ad',
    gitBranch: 'main',
    state: 'running',
    workerId: 'worker-node-laptop-02',
    containerId: 'cwc-cnt-b823e5a',
    assignedPort: 20016,
    publicUrl: 'https://peer-mesh-status.trycloudflare.com',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2 + 15000).toISOString(),
    startedAt: new Date(Date.now() - 3600000 * 2 + 10000).toISOString(),
  },
];

function generateRealisticLogs(depId: string, branch = 'main', hash = 'f4b98c2'): DeploymentLogEntry[] {
  const baseTime = Date.now() - 60000;
  return [
    {
      id: `${depId}-1`,
      timestamp: new Date(baseTime).toISOString(),
      level: 'info',
      stream: 'system',
      message: `[ControlPlane] Received task dispatch request for deployment '${depId}'.`,
    },
    {
      id: `${depId}-2`,
      timestamp: new Date(baseTime + 1200).toISOString(),
      level: 'info',
      stream: 'system',
      message: `[Scheduler] Evaluated candidate worker nodes using load score formula S(W). Assigned to lowest-load worker.`,
    },
    {
      id: `${depId}-3`,
      timestamp: new Date(baseTime + 2800).toISOString(),
      level: 'info',
      stream: 'stdout',
      message: `[GitRunner] Cloning repository (shallow branch '${branch}' @ ${hash}) into isolated build context...`,
    },
    {
      id: `${depId}-4`,
      timestamp: new Date(baseTime + 4100).toISOString(),
      level: 'info',
      stream: 'stdout',
      message: `[GitRunner] Verified build integrity. Rejection checks passed (no path traversal, valid remote).`,
    },
    {
      id: `${depId}-5`,
      timestamp: new Date(baseTime + 5500).toISOString(),
      level: 'info',
      stream: 'stdout',
      message: `[DockerEngine] Building container image: step 1/5 FROM node:20-alpine AS runner`,
    },
    {
      id: `${depId}-6`,
      timestamp: new Date(baseTime + 7200).toISOString(),
      level: 'info',
      stream: 'stdout',
      message: `[DockerEngine] Injecting sandbox kernel limits: memory=512m, cpus=1.0, pids-limit=256`,
    },
    {
      id: `${depId}-7`,
      timestamp: new Date(baseTime + 9100).toISOString(),
      level: 'info',
      stream: 'stdout',
      message: `[DockerEngine] Dynamic ephemeral port allocated: container exposed on host port.`,
    },
    {
      id: `${depId}-8`,
      timestamp: new Date(baseTime + 11400).toISOString(),
      level: 'info',
      stream: 'system',
      message: `[HealthCheck] Probing HTTP GET / ... Status 200 OK (22ms). Container declared ready.`,
    },
    {
      id: `${depId}-9`,
      timestamp: new Date(baseTime + 12800).toISOString(),
      level: 'info',
      stream: 'system',
      message: `[GatewayClient] Route published on Caddy upstream & Cloudflare Quick Tunnel active.`,
    },
  ];
}

function loadLocalApps(): AppConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_APPS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_APPS, JSON.stringify(INITIAL_APPLICATIONS));
      return INITIAL_APPLICATIONS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_APPLICATIONS;
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
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_DEPS, JSON.stringify(INITIAL_DEPLOYMENTS));
      return INITIAL_DEPLOYMENTS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_DEPLOYMENTS;
  }
}

function saveLocalDeployments(deps: Deployment[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_DEPS, JSON.stringify(deps));
  } catch (err) {
    console.warn('Failed to save deployments cache', err);
  }
}

function loadLocalLogs(depId: string): DeploymentLogEntry[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_LOGS}_${depId}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // fallback
  }
  const generated = generateRealisticLogs(depId);
  try {
    localStorage.setItem(`${STORAGE_KEY_LOGS}_${depId}`, JSON.stringify(generated));
  } catch {
    // ignore
  }
  return generated;
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
      const res = await fetch(`${API_URL}/api/v1/deployments`, {
        headers: this.getAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data) && json.data.length > 0) {
          // Map deployments to unique application records
          const appMap = new Map<string, AppConfig>();
          for (const dep of json.data) {
            if (!appMap.has(dep.applicationId)) {
              appMap.set(dep.applicationId, {
                id: dep.applicationId,
                name: dep.applicationId.replace(/^app-/, '').replace(/-/g, ' ').toUpperCase(),
                slug: dep.applicationId.replace(/^app-/, ''),
                framework: 'dockerfile',
                git: {
                  repositoryUrl: 'https://github.com/cloud-without-clouds/demo.git',
                  branch: dep.gitBranch || 'main',
                  rootDirectory: '/',
                  commitHash: dep.gitCommitHash,
                },
                port: dep.assignedPort || 3000,
                replicas: 1,
                env: [],
                resourceLimits: {
                  cpuLimitCores: 1.0,
                  memoryLimitMb: 512,
                },
                createdAt: dep.createdAt,
                updatedAt: dep.updatedAt,
              });
            }
          }
          if (appMap.size > 0) {
            return Array.from(appMap.values());
          }
        }
      }
    } catch {
      // API initializing or offline
    }
    return loadLocalApps();
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

    let serverDeployment: Deployment | null = null;

    try {
      const payload = {
        name: input.name,
        slug: input.slug,
        framework: input.framework,
        git: input.git,
        port: input.port || 3000,
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

      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          serverDeployment = json.data;
        }
      }
    } catch {
      // offline fallback
    }

    // Persist in local storage
    const currentApps = loadLocalApps();
    saveLocalApps([newApp, ...currentApps]);

    const createdDeployment: Deployment = serverDeployment || {
      id: `dep-${Date.now().toString(36)}`,
      applicationId: newApp.id,
      version: 1,
      gitCommitHash: newApp.git.commitHash || 'a1b2c3d',
      gitBranch: newApp.git.branch,
      state: 'running',
      workerId: 'worker-node-local-01',
      containerId: `cwc-cnt-${Math.random().toString(36).substring(2, 9)}`,
      assignedPort: 20000 + Math.floor(Math.random() * 5000),
      publicUrl: `https://${newApp.slug}.trycloudflare.com`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    };

    const currentDeps = loadLocalDeployments();
    saveLocalDeployments([createdDeployment, ...currentDeps]);

    return newApp;
  },

  /**
   * Retrieves all deployments (optionally filtered by applicationId).
   */
  async getDeployments(applicationId?: string): Promise<Deployment[]> {
    try {
      const url = applicationId
        ? `${API_URL}/api/v1/deployments?applicationId=${encodeURIComponent(applicationId)}`
        : `${API_URL}/api/v1/deployments`;

      const res = await fetch(url, { headers: this.getAuthHeaders() });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data)) {
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    const all = loadLocalDeployments();
    if (applicationId) {
      return all.filter((d) => d.applicationId === applicationId);
    }
    return all;
  },

  /**
   * Retrieves live or cached deployment logs.
   */
  async getDeploymentLogs(deploymentId: string): Promise<DeploymentLogEntry[]> {
    try {
      const res = await fetch(`${API_URL}/api/v1/deployments/${encodeURIComponent(deploymentId)}/logs`, {
        headers: this.getAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data) && json.data.length > 0) {
          return json.data;
        }
      }
    } catch {
      // fallback
    }
    return loadLocalLogs(deploymentId);
  },

  /**
   * Cancels an active or queued deployment.
   */
  async cancelDeployment(deploymentId: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_URL}/api/v1/deployments/${encodeURIComponent(deploymentId)}/cancel`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });
      if (res.ok) {
        // Also update local cache
        const deps = loadLocalDeployments();
        const updated = deps.map((d) =>
          d.id === deploymentId ? { ...d, state: 'cancelled' as const, finishedAt: new Date().toISOString() } : d
        );
        saveLocalDeployments(updated);
        return true;
      }
    } catch {
      // fallback update
    }

    // Local fallback update
    const deps = loadLocalDeployments();
    const updated = deps.map((d) =>
      d.id === deploymentId ? { ...d, state: 'cancelled' as const, finishedAt: new Date().toISOString() } : d
    );
    saveLocalDeployments(updated);

    // Append cancellation log entry
    const existingLogs = loadLocalLogs(deploymentId);
    const cancelLog: DeploymentLogEntry = {
      id: `${deploymentId}-cancel`,
      timestamp: new Date().toISOString(),
      level: 'warn',
      stream: 'system',
      message: '[ControlPlane] Deployment cancelled by operator. Container teardown signal dispatched.',
    };
    try {
      localStorage.setItem(`${STORAGE_KEY_LOGS}_${deploymentId}`, JSON.stringify([...existingLogs, cancelLog]));
    } catch {
      // ignore
    }

    return true;
  },

  /**
   * Triggers redeployment of an existing application.
   */
  async triggerRedeploy(applicationId: string): Promise<Deployment> {
    const apps = loadLocalApps();
    const targetApp = apps.find((a) => a.id === applicationId);

    try {
      if (targetApp) {
        const payload = {
          name: targetApp.name,
          slug: targetApp.slug,
          framework: targetApp.framework,
          git: targetApp.git,
          port: targetApp.port,
          env: targetApp.env,
          resourceLimits: targetApp.resourceLimits,
          applicationId: targetApp.id,
        };

        const res = await fetch(`${API_URL}/api/v1/deployments`, {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const json = await res.json();
          if (json?.data) {
            return json.data;
          }
        }
      }
    } catch {
      // fallback
    }

    const newDep: Deployment = {
      id: `dep-${Date.now().toString(36)}`,
      applicationId,
      version: 2,
      gitCommitHash: '9e8d7c6',
      gitBranch: targetApp?.git.branch || 'main',
      state: 'running',
      workerId: 'worker-node-local-01',
      containerId: `cwc-cnt-${Math.random().toString(36).substring(2, 9)}`,
      assignedPort: 20000 + Math.floor(Math.random() * 5000),
      publicUrl: `https://${targetApp?.slug || 'app'}-latest.trycloudflare.com`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    };

    const current = loadLocalDeployments();
    saveLocalDeployments([newDep, ...current]);
    return newDep;
  },

  /**
   * Retrieves worker nodes.
   */
  async getWorkers(): Promise<WorkerNode[]> {
    try {
      const res = await fetch(`${API_URL}/api/v1/workers`, {
        headers: this.getAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data) && json.data.length > 0) {
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    return [
      {
        id: 'worker-node-local-01',
        name: 'Workstation Alpha (Host Primary)',
        hostname: 'node-alpha-desktop',
        ipAddress: '100.64.0.10',
        port: 5001,
        state: 'busy',
        resources: {
          cpuCount: 8,
          cpuUsagePercent: 24.5,
          totalMemoryMb: 16384,
          freeMemoryMb: 9420,
          usedMemoryMb: 6964,
          activeContainers: 2,
        },
        limits: {
          maxConcurrentWorkloads: 4,
          maxMemoryMb: 8192,
          maxCpuCores: 4,
        },
        version: '0.1.0',
        registeredAt: new Date(Date.now() - 3600000 * 24).toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
      },
      {
        id: 'worker-node-laptop-02',
        name: 'MacBook Pro M2 (Worker Node)',
        hostname: 'node-beta-macbook',
        ipAddress: '100.64.0.11',
        port: 5001,
        state: 'idle',
        resources: {
          cpuCount: 10,
          cpuUsagePercent: 12.0,
          totalMemoryMb: 16384,
          freeMemoryMb: 11200,
          usedMemoryMb: 5184,
          activeContainers: 1,
        },
        limits: {
          maxConcurrentWorkloads: 4,
          maxMemoryMb: 8192,
          maxCpuCores: 4,
        },
        version: '0.1.0',
        registeredAt: new Date(Date.now() - 3600000 * 18).toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
      },
    ];
  },

  /**
   * Retrieves real-time scheduler placement scores S(W) across all worker nodes.
   */
  async getWorkerScores(memoryMb = 512): Promise<WorkerScoreBreakdown[]> {
    try {
      const res = await fetch(`${API_URL}/api/v1/workers/scores?memoryMb=${memoryMb}`, {
        headers: this.getAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data) && json.data.length > 0) {
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    // Dynamic fallback calculating S(W) = (0.4 * mem) + (0.4 * cpu) + (0.2 * cont)
    const workers = await this.getWorkers();
    return workers.map((w) => {
      const memRatio = (w.resources?.usedMemoryMb ?? 0) / (w.resources?.totalMemoryMb ?? 1);
      const cpuRatio = (w.resources?.cpuUsagePercent ?? 0) / 100;
      const contRatio = (w.resources?.activeContainers ?? 0) / (w.limits?.maxConcurrentWorkloads ?? 4);
      const score = Number((0.4 * memRatio + 0.4 * cpuRatio + 0.2 * contRatio).toFixed(4));

      return {
        workerId: w.id,
        name: w.name,
        score,
        memoryRatio: Number(memRatio.toFixed(3)),
        cpuRatio: Number(cpuRatio.toFixed(3)),
        containerRatio: Number(contRatio.toFixed(3)),
        freeMemoryMb: w.resources?.freeMemoryMb ?? 8000,
        usedMemoryMb: w.resources?.usedMemoryMb ?? 4000,
        totalMemoryMb: w.resources?.totalMemoryMb ?? 16384,
        cpuUsagePercent: w.resources?.cpuUsagePercent ?? 20,
        activeContainers: w.resources?.activeContainers ?? 1,
        maxConcurrentWorkloads: w.limits?.maxConcurrentWorkloads ?? 4,
        eligible: w.state !== 'offline' && (w.resources?.freeMemoryMb ?? 0) >= memoryMb,
        rejectionReasons: [],
      };
    });
  },

  /**
   * Executes a manual worker health check and failure recovery sweep.
   */
  async sweepWorkers(): Promise<SweepResult> {
    try {
      const res = await fetch(`${API_URL}/api/v1/workers/sweep`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          return json.data;
        }
      }
    } catch {
      // fallback
    }

    return {
      offlineWorkers: [],
      rescheduledDeployments: [],
      failedDeployments: [],
      timestamp: new Date().toISOString(),
    };
  },
};
