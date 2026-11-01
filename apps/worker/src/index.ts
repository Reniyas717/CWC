import os from 'os';
import { WorkerHeartbeat, WorkerRegistration } from '@cloud-without-clouds/shared';
import { workerConfig } from './config.js';
import { createLogger } from './logger.js';
import { ControlPlaneClient } from './services/control-plane-client.js';
import { DeploymentRunner } from './services/deployment-runner.js';
import { DockerEngine } from './services/docker-engine.js';
import { GitRunner } from './services/git-runner.js';
import { MetricsService } from './services/metrics.js';
import { TaskPoller } from './services/task-poller.js';
import { discoverTailscaleAddress } from './services/tailscale-address.js';

const logger = createLogger('WorkerAgent');

let heartbeatTimer: NodeJS.Timeout | null = null;
let isHeartbeatRunning = false;
let isShuttingDown = false;
let isRegistered = false;
let taskPoller: TaskPoller | null = null;
let dockerEngine: DockerEngine | null = null;
let dockerReady = false;

async function bootstrap() {
  logger.info('==================================================');
  logger.info('🤖 Cloud Without Clouds - Distributed Worker Agent');
  logger.info('==================================================');
  logger.info(`Worker ID         : ${workerConfig.WORKER_ID}`);
  logger.info(`Worker Name       : ${workerConfig.WORKER_NAME}`);
  logger.info(`Control Plane URL : ${workerConfig.CONTROL_PLANE_URL}`);
  logger.info(`Worker Port       : ${workerConfig.WORKER_PORT}`);
  logger.info(`Max Workloads     : ${workerConfig.MAX_CONCURRENT_WORKLOADS}`);
  logger.info(`Memory Limit      : ${workerConfig.TOTAL_MEMORY_LIMIT_MB} MB`);
  logger.info(`Max CPU Cores     : ${workerConfig.MAX_CPU_CORES}`);
  logger.info(`Heartbeat Interval: ${workerConfig.HEARTBEAT_INTERVAL_MS} ms`);
  logger.info(`Environment       : ${workerConfig.NODE_ENV}`);
  logger.info('==================================================');

  const metricsService = new MetricsService();
  const controlPlaneClient = new ControlPlaneClient();
  const gitRunner = new GitRunner();
  dockerEngine = new DockerEngine();

  const initialDockerStatus = await dockerEngine.checkAvailability();
  dockerReady = initialDockerStatus.available;
  metricsService.setRuntimeReady(dockerReady);
  if (dockerReady) {
    logger.info(
      `Docker daemon verified reachable${initialDockerStatus.version ? ` (version ${initialDockerStatus.version})` : ''}`
    );
  } else {
    logger.error('Docker daemon is unavailable; worker will remain in error state and will not be eligible for deployments', {
      error: initialDockerStatus.error,
    });
  }

  // Reconcile and clean up any orphan containers left by previous ungraceful worker shutdowns
  const orphans = await dockerEngine.reconcileExistingContainers();
  if (orphans.length > 0) {
    logger.info(`Cleaned up ${orphans.length} orphan container(s) from previous session`, {
      cleanedDeployments: orphans,
    });
  }

  const deploymentRunner = new DeploymentRunner(
    gitRunner,
    dockerEngine,
    controlPlaneClient,
    metricsService
  );

  taskPoller = new TaskPoller(controlPlaneClient, deploymentRunner);

  // 1. Initial health inspection of host resources
  const initialResources = metricsService.getResources();
  logger.info('Host initial metrics collected', {
    cpuCores: initialResources.cpuCount,
    totalMemoryMb: initialResources.totalMemoryMb,
    freeMemoryMb: initialResources.freeMemoryMb,
    usedMemoryMb: initialResources.usedMemoryMb,
  });

  // 2. Initial reachability check of Control Plane
  const isHealthy = await controlPlaneClient.checkHealth();
  if (isHealthy) {
    logger.info(`Control Plane verified reachable at ${workerConfig.CONTROL_PLANE_URL}`);
  } else {
    logger.warn(
      `Control Plane currently unreachable at ${workerConfig.CONTROL_PLANE_URL}. Starting in resilient standby mode.`
    );
  }

  // 3. Worker registration with Control Plane. Do not fall back to localhost:
  // the gateway must only receive an address reachable over Tailscale.
  const tailscaleAddress = discoverTailscaleAddress();
  const registrationPayload: WorkerRegistration = {
    id: workerConfig.WORKER_ID,
    name: workerConfig.WORKER_NAME,
    hostname: os.hostname(),
    ipAddress: tailscaleAddress,
    port: workerConfig.WORKER_PORT,
    authToken: workerConfig.WORKER_SECRET_TOKEN,
    resources: initialResources,
    limits: {
      maxConcurrentWorkloads: workerConfig.MAX_CONCURRENT_WORKLOADS,
      maxMemoryMb: workerConfig.TOTAL_MEMORY_LIMIT_MB,
      maxCpuCores: workerConfig.MAX_CPU_CORES,
    },
    version: '0.1.0',
  };

  const attemptRegistration = async (): Promise<boolean> => {
    try {
      const regResponse = await controlPlaneClient.register(registrationPayload);
      if (regResponse.ok) {
        isRegistered = true;
        logger.info('Worker successfully registered with Control Plane');
        if (!dockerReady) {
          await controlPlaneClient.sendStatus(
            workerConfig.WORKER_ID,
            'error',
            `Docker runtime unavailable: ${initialDockerStatus.error || 'daemon did not respond'}`
          );
          taskPoller?.stop();
        } else {
          taskPoller?.start();
        }
        return true;
      } else if (regResponse.isNotImplemented) {
        logger.warn(
          `Worker registration endpoint returned HTTP ${regResponse.statusCode}. Control-plane registration handler is pending implementation by Teammate 2.`
        );
      } else {
        logger.warn(
          `Worker registration attempt unsuccessful: ${regResponse.error || `HTTP ${regResponse.statusCode}`}. Retrying in subsequent heartbeat cycles.`
        );
      }
    } catch {
      // Ignore network errors during registration attempt
    }
    return false;
  };

  await attemptRegistration();

  // 4. Start task polling only when Docker is ready. Heartbeats remain active
  // in standby mode so the control plane can observe recovery without
  // advertising a worker that cannot execute assigned workloads.
  if (dockerReady) {
    taskPoller.start();
  } else {
    logger.warn('Task polling paused until Docker runtime becomes available');
  }

  // 5. Non-overlapping periodic heartbeat telemetry loop
  const executeHeartbeat = async () => {
    if (isShuttingDown || isHeartbeatRunning) {
      return;
    }

    isHeartbeatRunning = true;
    try {
      if (dockerEngine) {
        const dockerStatus = await dockerEngine.checkAvailability();
        if (dockerStatus.available !== dockerReady) {
          dockerReady = dockerStatus.available;
          metricsService.setRuntimeReady(dockerReady);
          if (dockerReady) {
            logger.info(
              `Docker daemon recovered${dockerStatus.version ? ` (version ${dockerStatus.version})` : ''}`
            );
            taskPoller?.start();
          } else {
            logger.error('Docker daemon became unavailable; pausing deployment eligibility', {
              error: dockerStatus.error,
            });
            taskPoller?.stop();
          }
        }
      }

      if (dockerReady) {
        await deploymentRunner.reconcileActiveDeployments();
      }

      // If registration was not acknowledged yet, attempt re-registration
      if (!isRegistered) {
        await attemptRegistration();
      }

      const resources = metricsService.getResources();
      const heartbeatPayload: WorkerHeartbeat = {
        workerId: workerConfig.WORKER_ID,
        state: metricsService.getState(),
        resources,
        activeWorkloadIds: metricsService.getActiveWorkloadIds(),
        timestamp: new Date().toISOString(),
      };

      const res = await controlPlaneClient.sendHeartbeat(heartbeatPayload);
      if (res.ok) {
        logger.debug('Heartbeat acknowledged by Control Plane', {
          state: heartbeatPayload.state,
          freeMemoryMb: resources.freeMemoryMb,
          cpuUsagePercent: resources.cpuUsagePercent,
          activeContainers: resources.activeContainers,
        });
      } else if (res.isNotImplemented) {
        logger.debug(
          `Heartbeat endpoint returned HTTP ${res.statusCode} (endpoint pending on Control Plane)`
        );
      } else {
        logger.warn(`Heartbeat report failed: ${res.error || `HTTP ${res.statusCode}`}`);
      }
    } catch (err: unknown) {
      logger.error('Unexpected error during heartbeat execution', err);
    } finally {
      isHeartbeatRunning = false;
    }
  };

  // Start heartbeat interval timer
  heartbeatTimer = setInterval(executeHeartbeat, workerConfig.HEARTBEAT_INTERVAL_MS);
  logger.info(
    `Heartbeat telemetry loop active (interval: ${workerConfig.HEARTBEAT_INTERVAL_MS}ms)`
  );

  // 6. Graceful termination handler
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received ${signal}. Initiating graceful worker shutdown...`);

    if (taskPoller) {
      taskPoller.stop();
    }

    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    metricsService.setState('draining');

    try {
      // Notify Control Plane about draining state with short timeout
      await controlPlaneClient.sendStatus(
        workerConfig.WORKER_ID,
        'draining',
        `Worker shutting down via ${signal}`
      );
    } catch {
      // Ignore network errors on shutdown
    }

    // Stop and remove all active containers
    if (dockerEngine) {
      await dockerEngine.cleanupAllContainers();
    }

    metricsService.setState('offline');
    logger.info('Worker agent shut down cleanly. Exiting.');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  if (dockerReady) {
    logger.info('[Worker Ready] Worker agent initialized and awaiting deployment tasks.');
  } else {
    logger.warn(
      '[Worker Standby] Worker agent is connected, but Docker is unavailable. Heartbeats will continue while deployment work is paused.'
    );
  }
}

bootstrap().catch((err: unknown) => {
  logger.error('Fatal error during worker bootstrap', err);
  process.exit(1);
});
