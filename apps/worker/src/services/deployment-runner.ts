import {
  DeploymentLogEntry,
  DeploymentResultPayload,
  DeploymentTaskPayload,
  DeploymentTaskPayloadSchema,
} from '@cloud-without-clouds/shared';
import { workerConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { ControlPlaneClient } from './control-plane-client.js';
import { DockerEngine } from './docker-engine.js';
import { GitRunner } from './git-runner.js';
import { MetricsService } from './metrics.js';
import { discoverTailscaleAddress } from './tailscale-address.js';

const logger = createLogger('DeploymentRunner');

export class DeploymentRunner {
  private gitRunner: GitRunner;
  private dockerEngine: DockerEngine;
  private controlPlaneClient: ControlPlaneClient;
  private metricsService: MetricsService;
  private activeDeployments: Set<string> = new Set();
  private activeAttemptIds: Map<string, string | undefined> = new Map();
  private inProgressControllers: Map<string, AbortController> = new Map();
  private pendingRuntimeFailures: Map<string, {
    deploymentId: string;
    containerId: string;
    assignedPort: number;
    attemptId?: string;
    reason: string;
  }> = new Map();

  constructor(
    gitRunner: GitRunner,
    dockerEngine: DockerEngine,
    controlPlaneClient: ControlPlaneClient,
    metricsService: MetricsService
  ) {
    this.gitRunner = gitRunner;
    this.dockerEngine = dockerEngine;
    this.controlPlaneClient = controlPlaneClient;
    this.metricsService = metricsService;
  }

  public isDeploymentActive(deploymentId: string): boolean {
    return this.activeDeployments.has(deploymentId);
  }

  /**
   * Detect containers removed outside the worker and tell the control plane so
   * it can remove stale routes. Failed reports remain in
   * memory for the next heartbeat if the control plane is temporarily down.
   */
  public async reconcileActiveDeployments(): Promise<void> {
    const staleContainers = await this.dockerEngine.reconcileActiveContainers();

    for (const stale of staleContainers) {
      const controller = this.inProgressControllers.get(stale.deploymentId);
      controller?.abort();
      this.activeDeployments.delete(stale.deploymentId);
      this.inProgressControllers.delete(stale.deploymentId);
      this.activeAttemptIds.delete(stale.deploymentId);
      this.metricsService.unregisterWorkload(stale.deploymentId);
      this.pendingRuntimeFailures.set(stale.deploymentId, {
        ...stale,
        assignedPort: stale.hostPort,
      });
    }

    for (const failure of this.pendingRuntimeFailures.values()) {
      try {
        const response = await this.controlPlaneClient.reportResult({
          deploymentId: failure.deploymentId,
          workerId: workerConfig.WORKER_ID,
          attemptId: failure.attemptId,
          state: 'failed',
          containerId: failure.containerId,
          assignedPort: failure.assignedPort,
          errorMessage: `Managed container disappeared or stopped: ${failure.reason}`,
        });

        if (response.ok || response.statusCode === 409) {
          logger.warn(`Reported stale container failure for ${failure.deploymentId}`, {
            containerId: failure.containerId,
            statusCode: response.statusCode,
          });
          this.pendingRuntimeFailures.delete(failure.deploymentId);
        } else {
          logger.warn(`Could not report stale container failure for ${failure.deploymentId}; will retry`, {
            error: response.error || `HTTP ${response.statusCode}`,
          });
        }
      } catch (error: unknown) {
        logger.warn(`Could not report stale container failure for ${failure.deploymentId}; will retry`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Orchestrates the complete deployment pipeline:
   * Git Clone -> Docker Build -> Docker Run -> Health Verification -> Report Result.
   */
  public async executeTask(taskPayload: DeploymentTaskPayload): Promise<DeploymentResultPayload> {
    const task = DeploymentTaskPayloadSchema.parse(taskPayload);
    const { deploymentId } = task;

    if (this.activeDeployments.has(deploymentId)) {
      logger.warn(`Deployment ${deploymentId} is already executing. Ignoring duplicate task.`);
      return {
        deploymentId,
        workerId: workerConfig.WORKER_ID,
        state: 'failed',
        errorMessage: 'Duplicate task rejected - deployment already running',
      };
    }

    const abortController = new AbortController();
    this.activeDeployments.add(deploymentId);
    this.activeAttemptIds.set(deploymentId, task.attemptId);
    this.inProgressControllers.set(deploymentId, abortController);
    this.metricsService.registerWorkload(deploymentId);

    const allLogs: DeploymentLogEntry[] = [];
    const addLog = (
      message: string,
      stream: 'stdout' | 'stderr' | 'system' = 'system',
      level: 'info' | 'warn' | 'error' = 'info'
    ) => {
      allLogs.push({
        timestamp: new Date().toISOString(),
        level,
        message,
        stream,
      });
    };

    logger.info(`Starting deployment execution for ${deploymentId}...`, {
      repositoryUrl: task.git.repositoryUrl,
      branch: task.git.branch,
      targetPort: task.targetPort,
    });
    addLog(`Worker accepted deployment task ${deploymentId}`, 'system', 'info');

    let workingDir: string | null = null;
    let commitSha: string | null = null;
    let imageTag: string | null = null;

    try {
      // Step 1: Git checkout
      addLog(
        `Cloning repository from ${task.git.repositoryUrl} (branch: ${task.git.branch || 'main'})...`,
        'system',
        'info'
      );
      const cloneResult = await this.gitRunner.cloneRepository({
        deploymentId,
        repositoryUrl: task.git.repositoryUrl,
        branch: task.git.branch,
        commitHash: task.git.commitHash,
        signal: abortController.signal,
      });

      workingDir = cloneResult.workingDir;
      commitSha = cloneResult.commitSha;
      addLog(`Repository checked out at commit ${commitSha}`, 'system', 'info');

      // Step 2: Docker build
      const buildContext =
        task.buildContext || (task.git.rootDirectory !== '/' ? task.git.rootDirectory : '.');
      const dockerfilePath = task.dockerfilePath || 'Dockerfile';

      addLog(
        `Building Docker image using ${dockerfilePath} (context: ${buildContext})...`,
        'system',
        'info'
      );
      const buildResult = await this.dockerEngine.buildImage({
        deploymentId,
        workingDir,
        dockerfilePath,
        buildContext,
        targetPort: task.targetPort,
        signal: abortController.signal,
      });

      imageTag = buildResult.imageTag;
      allLogs.push(...buildResult.logs);
      addLog(`Docker image ${imageTag} build complete`, 'system', 'info');

      // Step 3: Run container with enforced caps & dynamic ephemeral port
      const tailscaleAddress = discoverTailscaleAddress();
      addLog(
        `Publishing the application only on worker Tailscale address ${tailscaleAddress}...`,
        'system',
        'info'
      );
      addLog(
        `Starting container with memory: ${task.resourceLimits.memoryLimitMb}MB, cpus: ${task.resourceLimits.cpuLimitCores}...`,
        'system',
        'info'
      );
      const runResult = await this.dockerEngine.runContainer({
        deploymentId,
        attemptId: task.attemptId,
        imageTag,
        hostIp: tailscaleAddress,
        targetPort: task.targetPort,
        memoryLimitMb: task.resourceLimits.memoryLimitMb,
        cpuLimitCores: task.resourceLimits.cpuLimitCores,
        env: task.env,
        healthCheckPath: task.healthCheckPath,
        signal: abortController.signal,
      });

      allLogs.push(...runResult.logs);
      addLog(
        `Application successfully deployed on ${runResult.publicUrl} with verified limits (RAM: ${Math.round(runResult.resourceCaps.memoryBytes / (1024 * 1024))}MB, CPUs: ${runResult.resourceCaps.nanoCpus / 1e9}, PIDs: ${runResult.resourceCaps.pidsLimit})`,
        'system',
        'info'
      );

      // Clean up temporary clone workspace
      await this.gitRunner.cleanup(workingDir);
      workingDir = null;

      // Construct success result
      const resultPayload: DeploymentResultPayload = {
        deploymentId,
        workerId: workerConfig.WORKER_ID,
        attemptId: task.attemptId,
        state: 'running',
        containerId: runResult.containerId,
        assignedPort: runResult.assignedPort,
        publicUrl: runResult.publicUrl,
        gitCommitHash: commitSha,
        imageTag,
        errorMessage: null,
      };

      // Report result and flush logs to Control Plane. A 409 means this
      // worker lost the assignment while it was building or starting. The
      // container is already running at this point, so remove it before
      // returning; otherwise a reconnecting/stale worker can orphan work on
      // the host even though the control plane rejected the result.
      const reportResponse = await this.controlPlaneClient.reportResult(resultPayload);
      if (!reportResponse.ok) {
        await this.dockerEngine.forceRemoveContainer(runResult.containerId);
        this.dockerEngine.unregisterActiveContainer(deploymentId);
        this.metricsService.unregisterWorkload(deploymentId);
        throw new Error(
          reportResponse.statusCode === 409
            ? 'Control plane rejected this deployment result as stale; running container was removed'
            : `Control plane rejected deployment result (${reportResponse.statusCode}): ${reportResponse.error || 'unknown error'}`
        );
      }
      await this.controlPlaneClient.sendLogs({ deploymentId, logs: allLogs });

      logger.info(
        `Deployment ${deploymentId} completed successfully on port ${runResult.assignedPort}`
      );
      return resultPayload;
    } catch (err: unknown) {
      const isAbort =
        (err instanceof Error && err.name === 'AbortError') || abortController.signal.aborted;
      const errorMessage = isAbort
        ? 'Deployment aborted by stop/cancel request'
        : err instanceof Error
          ? err.message
          : String(err);

      logger.error(`Deployment ${deploymentId} failed or aborted`, err);
      addLog(`Deployment status update: ${errorMessage}`, 'stderr', 'error');

      // Clean up directory if still present
      if (workingDir) {
        await this.gitRunner.cleanup(workingDir);
      }

      // Clean up any partially created or running container
      await this.dockerEngine.forceRemoveContainer(`cwc-${deploymentId.toLowerCase()}`);
      this.dockerEngine.unregisterActiveContainer(deploymentId);
      this.metricsService.unregisterWorkload(deploymentId);

      const failedResult: DeploymentResultPayload = {
        deploymentId,
        workerId: workerConfig.WORKER_ID,
        attemptId: task.attemptId,
        state: isAbort ? 'stopped' : 'failed',
        gitCommitHash: commitSha ?? undefined,
        imageTag: imageTag ?? undefined,
        errorMessage,
      };

      try {
        await this.controlPlaneClient.reportResult(failedResult);
        await this.controlPlaneClient.sendLogs({ deploymentId, logs: allLogs });
      } catch {
        // Ignore API transmission errors for failed terminal state
      }

      return failedResult;
    } finally {
      this.inProgressControllers.delete(deploymentId);
      this.activeDeployments.delete(deploymentId);
      this.activeAttemptIds.delete(deploymentId);
    }
  }

  /**
   * Stops an active deployment, aborts in-progress build/run, and cleans up its container.
   */
  public async stopDeployment(deploymentId: string): Promise<boolean> {
    logger.info(`Stopping deployment ${deploymentId}...`);

    // Abort in-progress Git clone or Docker build if currently executing
    const controller = this.inProgressControllers.get(deploymentId);
    if (controller) {
      logger.info(`Aborting in-progress execution for deployment ${deploymentId}`);
      controller.abort();
    }

    await this.dockerEngine.forceRemoveContainer(`cwc-${deploymentId.toLowerCase()}`);
    this.dockerEngine.unregisterActiveContainer(deploymentId);
    this.metricsService.unregisterWorkload(deploymentId);
    this.activeDeployments.delete(deploymentId);
    this.inProgressControllers.delete(deploymentId);

    try {
      const response = await this.controlPlaneClient.reportResult({
        deploymentId,
        workerId: workerConfig.WORKER_ID,
        attemptId: this.activeAttemptIds.get(deploymentId),
        state: 'stopped',
      });
      if (response.ok) {
        logger.info(`Cancellation acknowledged by Control Plane for ${deploymentId}`);
        return true;
      } else if (response.statusCode === 409) {
        logger.info(`Cancellation cleanup already finalized or stale for ${deploymentId}`);
        return true;
      } else {
        logger.warn(
          `Cancellation acknowledgement failed for ${deploymentId}: ${response.error || `HTTP ${response.statusCode}`}`
        );
      }
    } catch {
      logger.warn(`Cancellation acknowledgement could not reach Control Plane for ${deploymentId}`);
      return false;
    }

    return false;
  }
}
