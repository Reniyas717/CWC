import { workerEnv } from '../../config/env.js';
import { WorkerHealthMonitor } from '../health/status.js';

export class ControlPlaneClient {
  private controlPlaneUrl: string;
  private workerSecret: string;
  private healthMonitor: WorkerHealthMonitor;

  constructor(healthMonitor: WorkerHealthMonitor) {
    this.controlPlaneUrl = workerEnv.CONTROL_PLANE_URL;
    this.workerSecret = workerEnv.WORKER_SECRET_TOKEN;
    this.healthMonitor = healthMonitor;
  }

  public async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.controlPlaneUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  public async register(): Promise<void> {
    console.log(
      `[ControlPlaneClient] Prepared registration for worker ${workerEnv.WORKER_ID} at ${this.controlPlaneUrl}`
    );
  }

  public async sendHeartbeat(): Promise<void> {
    const status = this.healthMonitor.getStatus(workerEnv.WORKER_ID);
    console.log(
      `[ControlPlaneClient] Heartbeat ready: status=${status.state}, active=${status.activeWorkloads.length}`
    );
  }
}
