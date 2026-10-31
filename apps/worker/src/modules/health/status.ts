import { WorkerResources, WorkerState } from '@cloud-without-clouds/shared';
import { MetricsService } from '../../services/metrics.js';

export interface WorkerStatusReport {
  workerId: string;
  state: WorkerState;
  uptimeSeconds: number;
  resources: WorkerResources;
  activeWorkloads: string[];
  timestamp: string;
}

export class WorkerHealthMonitor {
  private metricsService: MetricsService;

  constructor(metricsService?: MetricsService) {
    this.metricsService = metricsService ?? new MetricsService();
  }

  public getResources(): WorkerResources {
    return this.metricsService.getResources();
  }

  public getStatus(workerId: string): WorkerStatusReport {
    return {
      workerId,
      state: this.metricsService.getState(),
      uptimeSeconds: Math.floor(process.uptime()),
      resources: this.metricsService.getResources(),
      activeWorkloads: this.metricsService.getActiveWorkloadIds(),
      timestamp: new Date().toISOString(),
    };
  }

  public setState(state: WorkerState): void {
    this.metricsService.setState(state);
  }

  public registerWorkload(workloadId: string): void {
    this.metricsService.registerWorkload(workloadId);
  }

  public unregisterWorkload(workloadId: string): void {
    this.metricsService.unregisterWorkload(workloadId);
  }
}
