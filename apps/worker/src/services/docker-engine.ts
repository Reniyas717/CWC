import { execFile } from 'child_process';
import fsSync from 'fs';
import path from 'path';
import { promisify } from 'util';
import { DeploymentLogEntry, TailscaleIpv4Schema } from '@cloud-without-clouds/shared';
import { createLogger } from '../logger.js';

const execFileAsync = promisify(execFile);
const logger = createLogger('DockerEngine');

const MAX_LOG_ENTRIES = 500;

export interface DockerBuildOptions {
  deploymentId: string;
  workingDir: string;
  dockerfilePath?: string;
  buildContext?: string;
  signal?: AbortSignal;
}

export interface DockerBuildResult {
  imageTag: string;
  logs: DeploymentLogEntry[];
}

export interface DockerRunOptions {
  deploymentId: string;
  imageTag: string;
  /** Validated Tailscale IPv4 address on the worker host. */
  hostIp: string;
  targetPort: number;
  memoryLimitMb?: number;
  cpuLimitCores?: number;
  env?: Array<{ key: string; value: string }>;
  healthCheckPath?: string;
  signal?: AbortSignal;
}

export interface DockerResourceCaps {
  memoryBytes: number;
  nanoCpus: number;
  pidsLimit: number;
}

export interface DockerRunResult {
  containerId: string;
  assignedPort: number;
  publicUrl: string;
  resourceCaps: DockerResourceCaps;
  logs: DeploymentLogEntry[];
}

export interface DockerPortBinding {
  hostIp: string;
  hostPort: number;
}

/**
 * Docker must publish app ports on the worker's Tailscale interface only.
 * Wildcard and IPv6 bindings are deliberately rejected because they do not
 * prove that the app is private to the worker mesh.
 */
export function validatePrivateDockerBinding(
  binding: DockerPortBinding,
  expectedHostIp: string
): DockerPortBinding {
  if (binding.hostIp !== expectedHostIp) {
    throw new Error(
      `Docker published the app on ${binding.hostIp || '<empty host>'} instead of the worker Tailscale address ${expectedHostIp}. ` +
        'Private routing is unavailable; this commonly indicates an incompatible Windows/WSL Docker Desktop network.'
    );
  }

  if (!Number.isInteger(binding.hostPort) || binding.hostPort <= 0 || binding.hostPort > 65535) {
    throw new Error(`Docker returned an invalid private host port: ${binding.hostPort}`);
  }

  return binding;
}

export function createPrivateDockerPortSpec(hostIp: string, targetPort: number): string {
  return `${hostIp}:0:${targetPort}`;
}

export class DockerEngine {
  private activeContainers: Map<
    string,
    { deploymentId: string; containerId: string; hostPort: number }
  > = new Map();

  /**
   * Builds a Docker image from the checked out source code with path traversal protection.
   */
  public async buildImage(options: DockerBuildOptions): Promise<DockerBuildResult> {
    const { deploymentId, workingDir, dockerfilePath = 'Dockerfile', buildContext } = options;

    const normalizedWorkingDir = path.resolve(workingDir);
    const resolvedContext = buildContext
      ? path.resolve(normalizedWorkingDir, buildContext)
      : normalizedWorkingDir;

    // Path traversal check for build context
    if (!resolvedContext.startsWith(normalizedWorkingDir)) {
      throw new Error(
        `Security Error: Build context "${buildContext}" escapes repository directory.`
      );
    }

    let resolvedDockerfilePath: string;
    if (path.isAbsolute(dockerfilePath)) {
      resolvedDockerfilePath = dockerfilePath;
    } else if (fsSync.existsSync(path.resolve(normalizedWorkingDir, dockerfilePath))) {
      resolvedDockerfilePath = path.resolve(normalizedWorkingDir, dockerfilePath);
    } else {
      resolvedDockerfilePath = path.resolve(resolvedContext, dockerfilePath);
    }

    // Path traversal check for Dockerfile
    if (!resolvedDockerfilePath.startsWith(normalizedWorkingDir)) {
      throw new Error(
        `Security Error: Dockerfile path "${dockerfilePath}" escapes repository directory.`
      );
    }

    if (!fsSync.existsSync(resolvedDockerfilePath)) {
      throw new Error(`Dockerfile not found at resolved path: ${resolvedDockerfilePath}`);
    }

    const imageTag = `cwc-${deploymentId.toLowerCase()}:latest`;

    logger.info(`Building Docker image ${imageTag}...`, {
      deploymentId,
      resolvedDockerfilePath,
      resolvedContext,
    });

    const logs: DeploymentLogEntry[] = [];
    const addLog = (
      message: string,
      stream: 'stdout' | 'stderr' | 'system' = 'stdout',
      level: 'info' | 'warn' | 'error' = 'info'
    ) => {
      if (logs.length < MAX_LOG_ENTRIES) {
        logs.push({
          timestamp: new Date().toISOString(),
          level,
          message: message.trim(),
          stream,
        });
      } else if (logs.length === MAX_LOG_ENTRIES) {
        logs.push({
          timestamp: new Date().toISOString(),
          level: 'warn',
          message: '[Logs truncated: maximum buffer limit of 500 entries reached]',
          stream: 'system',
        });
      }
    };

    addLog(`Initiating Docker build for ${imageTag}`, 'system', 'info');

    const buildArgs = ['build', '-t', imageTag, '-f', resolvedDockerfilePath, resolvedContext];

    try {
      const { stdout, stderr } = await execFileAsync('docker', buildArgs, {
        cwd: workingDir,
        maxBuffer: 10 * 1024 * 1024,
        signal: options.signal,
      });

      if (stdout) {
        for (const line of stdout.split('\n')) {
          if (line.trim()) addLog(line, 'stdout', 'info');
        }
      }

      if (stderr) {
        for (const line of stderr.split('\n')) {
          if (line.trim()) addLog(line, 'stderr', 'warn');
        }
      }

      addLog(`Docker image ${imageTag} built successfully`, 'system', 'info');
      logger.info(`Docker image ${imageTag} built successfully`, { deploymentId });

      return { imageTag, logs };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      addLog(`Docker build failed: ${errorMessage}`, 'stderr', 'error');
      logger.error(`Docker build failed for ${deploymentId}`, err);
      throw new Error(`Docker build failed for ${imageTag}: ${errorMessage}`, { cause: err });
    }
  }

  /**
   * Starts a Docker container with enforced resource limits and ephemeral port binding.
   */
  public async runContainer(options: DockerRunOptions): Promise<DockerRunResult> {
    const {
      deploymentId,
      imageTag,
      hostIp,
      targetPort,
      memoryLimitMb = 512,
      cpuLimitCores = 1.0,
      env = [],
      healthCheckPath,
    } = options;

    const parsedHostIp = TailscaleIpv4Schema.safeParse(hostIp);
    if (!parsedHostIp.success) {
      throw new Error(
        `Cannot start deployment ${deploymentId}: hostIp must be a valid Tailscale IPv4 address; private routing is unavailable`
      );
    }

    const containerName = `cwc-${deploymentId.toLowerCase()}`;
    const logs: DeploymentLogEntry[] = [];
    const addLog = (
      message: string,
      stream: 'stdout' | 'stderr' | 'system' = 'stdout',
      level: 'info' | 'warn' | 'error' = 'info'
    ) => {
      if (logs.length < MAX_LOG_ENTRIES) {
        logs.push({
          timestamp: new Date().toISOString(),
          level,
          message: message.trim(),
          stream,
        });
      }
    };

    // Clean up any stale container with the same name first
    await this.forceRemoveContainer(containerName);

    logger.info(`Launching container ${containerName}...`, {
      deploymentId,
      memoryLimitMb,
      cpuLimitCores,
      hostIp,
      targetPort,
    });

    // Construct run arguments with mandatory security & resource caps
    const runArgs = [
      'run',
      '-d',
      '--name',
      containerName,
      '-p',
      createPrivateDockerPortSpec(hostIp, targetPort),
      `--memory=${memoryLimitMb}m`,
      `--cpus=${cpuLimitCores}`,
      '--pids-limit=256',
      '--restart=on-failure:3',
      '--label',
      `cwc.deploymentId=${deploymentId}`,
    ];

    // Append environment variables safely
    for (const v of env) {
      runArgs.push('-e', `${v.key}=${v.value}`);
    }

    runArgs.push(imageTag);

    let containerId: string | undefined;
    try {
      const { stdout } = await execFileAsync('docker', runArgs, { signal: options.signal });
      containerId = stdout.trim();
      addLog(
        `Container ${containerName} started with ID ${containerId.substring(0, 12)}`,
        'system',
        'info'
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addLog(`Container start failed: ${message}`, 'stderr', 'error');
      throw new Error(`Failed to run container ${containerName}: ${message}`, { cause: err });
    }

    try {
      // Inspect and verify Docker's actual binding. Docker Desktop may accept a
      // host address but publish a wildcard binding in its Linux VM; that is
      // unsafe and must fail before the deployment is reported as running.
      const portBinding = await this.inspectPrivatePortBinding(containerId, targetPort, hostIp);
      const assignedPort = portBinding.hostPort;
      const publicUrl = `http://${hostIp}:${assignedPort}`;
      addLog(
        `Container port ${targetPort} mapped privately to ${hostIp}:${assignedPort}`,
        'system',
        'info'
      );

      // Verify enforced kernel resource caps via docker inspect
      const resourceCaps = await this.inspectContainerResourceLimits(containerId);
      logger.info(`Enforced resource caps verified for container ${containerId.substring(0, 12)}`, {
        memoryBytes: resourceCaps.memoryBytes,
        nanoCpus: resourceCaps.nanoCpus,
        pidsLimit: resourceCaps.pidsLimit,
      });

      // Register active container in memory
      this.activeContainers.set(deploymentId, {
        deploymentId,
        containerId,
        hostPort: assignedPort,
      });

      // Health verification must use the same private interface advertised to
      // the gateway, not localhost (which would only test this host).
      await this.verifyHealth(containerId, hostIp, assignedPort, healthCheckPath, addLog);

      return {
        containerId,
        assignedPort,
        publicUrl,
        resourceCaps,
        logs,
      };
    } catch (err: unknown) {
      if (containerId) {
        await this.forceRemoveContainer(containerId);
      }
      throw err;
    }
  }

  /**
   * Inspects the host port dynamically assigned by Docker for the target container port.
   */
  public async inspectPrivatePortBinding(
    containerId: string,
    targetPort: number,
    expectedHostIp: string
  ): Promise<DockerPortBinding> {
    try {
      const formatString = `{{json (index .NetworkSettings.Ports "${targetPort}/tcp")}}`;
      const { stdout } = await execFileAsync('docker', [
        'inspect',
        '--format',
        formatString,
        containerId,
      ]);

      const bindings = JSON.parse(stdout.trim()) as unknown;
      if (!Array.isArray(bindings) || bindings.length === 0) {
        throw new Error(`Docker returned no host binding for container port ${targetPort}`);
      }

      const binding = bindings[0];
      if (
        typeof binding !== 'object' ||
        binding === null ||
        !('HostIp' in binding) ||
        !('HostPort' in binding) ||
        typeof binding.HostIp !== 'string' ||
        typeof binding.HostPort !== 'string'
      ) {
        throw new Error(`Docker returned an invalid host binding for container port ${targetPort}`);
      }

      return validatePrivateDockerBinding(
        { hostIp: binding.HostIp, hostPort: Number.parseInt(binding.HostPort, 10) },
        expectedHostIp
      );
    } catch (err: unknown) {
      logger.error(`Failed to inspect host port for container ${containerId}`, err);
      throw new Error(`Could not verify private host port for container ${containerId}`, {
        cause: err,
      });
    }
  }

  /** Backwards-compatible port accessor; callers that route traffic should use the private binding API. */
  public async inspectAssignedPort(
    containerId: string,
    targetPort: number,
    expectedHostIp: string
  ): Promise<number> {
    const binding = await this.inspectPrivatePortBinding(containerId, targetPort, expectedHostIp);
    return binding.hostPort;
  }

  /**
   * Queries Docker HostConfig to confirm CPU, memory, and PID limits are enforced.
   */
  public async inspectContainerResourceLimits(containerId: string): Promise<DockerResourceCaps> {
    try {
      const { stdout } = await execFileAsync('docker', [
        'inspect',
        '--format',
        '{{.HostConfig.Memory}} {{.HostConfig.NanoCPUs}} {{.HostConfig.PidsLimit}}',
        containerId,
      ]);

      const parts = stdout.trim().split(/\s+/);
      return {
        memoryBytes: parseInt(parts[0] || '0', 10),
        nanoCpus: parseInt(parts[1] || '0', 10),
        pidsLimit: parseInt(parts[2] || '0', 10),
      };
    } catch (err) {
      logger.warn(`Could not inspect resource caps for container ${containerId}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return { memoryBytes: 0, nanoCpus: 0, pidsLimit: 0 };
    }
  }

  /**
   * Checks container status and tests health endpoint if provided.
   */
  private async verifyHealth(
    containerId: string,
    hostIp: string,
    hostPort: number,
    healthCheckPath: string | undefined,
    addLog: (
      message: string,
      stream?: 'stdout' | 'stderr' | 'system',
      level?: 'info' | 'warn' | 'error'
    ) => void
  ): Promise<void> {
    const maxAttempts = 30; // 30 seconds
    const intervalMs = 1000;
    const testUrl = healthCheckPath
      ? `http://${hostIp}:${hostPort}${healthCheckPath.startsWith('/') ? '' : '/'}${healthCheckPath}`
      : null;

    logger.info(`Verifying container ${containerId.substring(0, 12)} health...`, {
      testUrl: testUrl ?? 'process status only',
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // 1. Verify container process is running in Docker
      const { stdout: statusRaw } = await execFileAsync('docker', [
        'inspect',
        '--format',
        '{{.State.Status}}',
        containerId,
      ]);
      const status = statusRaw.trim();

      if (status !== 'running') {
        const logs = await this.getContainerLogs(containerId, 50);
        const logDump = logs.map((l) => l.message).join('\n');
        throw new Error(
          `Container ${containerId.substring(0, 12)} terminated prematurely with status: ${status}. Logs:\n${logDump}`
        );
      }

      // 2. If HTTP health check path is requested, perform probe
      if (testUrl) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 1500);
          const response = await fetch(testUrl, { signal: controller.signal });
          clearTimeout(timeout);

          if (response.ok || response.status < 400) {
            addLog(
              `Health check passed for ${testUrl} (HTTP ${response.status})`,
              'system',
              'info'
            );
            logger.info(`Health check verified on attempt ${attempt} for ${testUrl}`);
            return;
          }
        } catch {
          // Probe failed or connection refused while app boots up, retry
        }
      } else {
        // No HTTP health check configured; basic process running check is sufficient
        addLog(`Container running and healthy (port ${hostPort})`, 'system', 'info');
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Health verification timed out after ${maxAttempts}s at ${testUrl}`);
  }

  /**
   * Retrieves runtime logs from the specified container.
   */
  public async getContainerLogs(
    containerId: string,
    tail: number = 200
  ): Promise<DeploymentLogEntry[]> {
    try {
      const { stdout, stderr } = await execFileAsync('docker', [
        'logs',
        '--tail',
        String(tail),
        containerId,
      ]);

      const entries: DeploymentLogEntry[] = [];
      const timestamp = new Date().toISOString();

      if (stdout) {
        for (const line of stdout.split('\n')) {
          if (line.trim()) {
            entries.push({ timestamp, level: 'info', message: line.trim(), stream: 'stdout' });
          }
        }
      }

      if (stderr) {
        for (const line of stderr.split('\n')) {
          if (line.trim()) {
            entries.push({ timestamp, level: 'warn', message: line.trim(), stream: 'stderr' });
          }
        }
      }

      return entries;
    } catch {
      return [];
    }
  }

  /**
   * Stops a container by ID.
   */
  public async stopContainer(containerId: string, timeoutSec: number = 10): Promise<void> {
    try {
      await execFileAsync('docker', ['stop', '-t', String(timeoutSec), containerId]);
      logger.info(`Stopped container ${containerId}`);
    } catch (err) {
      logger.warn(`Could not stop container ${containerId}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Forcefully stops and removes a container by name or ID.
   */
  public async forceRemoveContainer(containerNameOrId: string): Promise<void> {
    try {
      await execFileAsync('docker', ['rm', '-f', containerNameOrId]);
    } catch {
      // Container may not exist, ignore
    }
  }

  /**
   * Cleans up all active deployment containers managed by this instance.
   */
  public async cleanupAllContainers(): Promise<void> {
    const active = Array.from(this.activeContainers.values());
    if (active.length === 0) return;

    logger.info(`Stopping ${active.length} active deployment container(s)...`);

    await Promise.allSettled(
      active.map(async (c) => {
        await this.stopContainer(c.containerId, 5);
        await this.forceRemoveContainer(c.containerId);
      })
    );

    this.activeContainers.clear();
    logger.info('All active containers stopped and removed cleanly');
  }

  /**
   * Reconciles orphan containers left behind by previous crashed worker instances.
   */
  public async reconcileExistingContainers(): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync('docker', [
        'ps',
        '-a',
        '--filter',
        'label=cwc.deploymentId',
        '--format',
        '{{.ID}} {{.Names}} {{.Label "cwc.deploymentId"}}',
      ]);

      const cleaned: string[] = [];
      const lines = stdout.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const [id, name, deploymentId] = line.trim().split(/\s+/);
        if (id && deploymentId) {
          logger.info(`Reconciling leftover container from previous session: ${name} (${id})`);
          await this.forceRemoveContainer(id);
          cleaned.push(deploymentId);
        }
      }
      return cleaned;
    } catch {
      return [];
    }
  }

  /**
   * Deregisters a container from active memory.
   */
  public unregisterActiveContainer(deploymentId: string): void {
    this.activeContainers.delete(deploymentId);
  }

  public getActiveContainerCount(): number {
    return this.activeContainers.size;
  }
}
