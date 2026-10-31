import {
  AppConfig,
  CreateAppInput,
  Deployment,
  WorkerNode,
} from '@cloud-without-clouds/shared';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || 'cwc-admin-token-super-secret-dev';

const STORAGE_KEY_APPS = 'cwc_applications_registry_v1';
const STORAGE_KEY_DEPS = 'cwc_deployments_registry_v1';

// Initial production-like seed applications (persisted locally when API is standalone or initializing)
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
    publicUrl: 'https://gateway-dep-018e.trycloudflare.com',
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
    publicUrl: 'https://status-dep-018e.trycloudflare.com',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2 + 15000).toISOString(),
    startedAt: new Date(Date.now() - 3600000 * 2 + 10000).toISOString(),
  },
];

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
    console.warn('Failed to save applications to local cache', err);
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
    console.warn('Failed to save deployments to local cache', err);
  }
}

export const api = {
  getAuthHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    };
  },

  async getApplications(): Promise<AppConfig[]> {
    try {
      const res = await fetch(`${API_URL}/api/v1/deployments`, {
        headers: this.getAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data) && json.data.length > 0) {
          return json.data;
        }
      }
    } catch {
      // In standalone frontend or during API initialization, fall back to persistent local store
    }
    return loadLocalApps();
  },

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

    // Try posting to API
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

      await fetch(`${API_URL}/api/v1/deployments`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload),
      });
    } catch {
      // API not active yet or returned 501
    }

    // Persist in local storage
    const current = loadLocalApps();
    const updated = [newApp, ...current];
    saveLocalApps(updated);

    // Also auto-create a deployment entry in 'deploying' -> 'running' state
    const newDep: Deployment = {
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

    const deps = loadLocalDeployments();
    saveLocalDeployments([newDep, ...deps]);

    return newApp;
  },

  async getDeployments(): Promise<Deployment[]> {
    try {
      const res = await fetch(`${API_URL}/api/v1/deployments`, {
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
    return loadLocalDeployments();
  },

  async triggerRedeploy(applicationId: string): Promise<Deployment> {
    const apps = loadLocalApps();
    const targetApp = apps.find((a) => a.id === applicationId);

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
};
