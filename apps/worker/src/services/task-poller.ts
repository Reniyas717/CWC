import { workerConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { ControlPlaneClient } from './control-plane-client.js';
import { DeploymentRunner } from './deployment-runner.js';

const logger = createLogger('TaskPoller');

export class TaskPoller {
  private controlPlaneClient: ControlPlaneClient;
  private deploymentRunner: DeploymentRunner;
  private pollIntervalMs: number;
  private isPolling = false;
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    controlPlaneClient: ControlPlaneClient,
    deploymentRunner: DeploymentRunner,
    pollIntervalMs: number = 3000
  ) {
    this.controlPlaneClient = controlPlaneClient;
    this.deploymentRunner = deploymentRunner;
    this.pollIntervalMs = pollIntervalMs;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info(`Starting task poller (interval: ${this.pollIntervalMs}ms)...`);
    this.scheduleNext();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    logger.info('Task poller stopped');
  }

  private scheduleNext(): void {
    if (!this.isRunning) return;
    this.pollTimer = setTimeout(() => void this.poll(), this.pollIntervalMs);
  }

  private async poll(): Promise<void> {
    if (!this.isRunning || this.isPolling) {
      return;
    }

    this.isPolling = true;

    try {
      const response = await this.controlPlaneClient.pollTasks(workerConfig.WORKER_ID);

      if (response.ok && response.data) {
        const rawData = response.data as { action?: string; deploymentId?: string };
        if (rawData.action === 'cancel' || rawData.action === 'stop') {
          if (rawData.deploymentId) {
            logger.info(`Received stop/cancel directive for deployment ${rawData.deploymentId}`);
            void this.deploymentRunner.stopDeployment(rawData.deploymentId);
          }
        } else if (response.data.hasTask && response.data.task) {
          const task = response.data.task;
          logger.info(`Received deployment task ${task.deploymentId} from Control Plane`, {
            deploymentId: task.deploymentId,
            repo: task.git.repositoryUrl,
          });

          // Run task asynchronously so it does not block the polling loop
          void this.deploymentRunner.executeTask(task);
        }
      } else if (response.isNotImplemented) {
        logger.debug(
          `Task polling endpoint returned HTTP ${response.statusCode} (endpoint not yet implemented on Control Plane)`
        );
      }
    } catch (err: unknown) {
      logger.error('Unexpected error while polling tasks', err);
    } finally {
      this.isPolling = false;
      this.scheduleNext();
    }
  }
}
