import os from 'os';
import { WorkerResources, WorkerState } from '@cloud-without-clouds/shared';

export interface WorkerStatusReport {
  workerId: string;
  state: WorkerState;
  uptimeSeconds: number;
  resources: WorkerResources;
  activeWorkloads: string[];
  timestamp: string;
}

export class WorkerHealthMonitor {
  private activeWorkloadIds: Set<string> = new Set();
  private currentState: WorkerState = 'idle';

  public getResources(): WorkerResources {
    const totalMem = Math.round(os.totalmem() / (1024 * 1024));
    const freeMem = Math.round(os.freemem() / (1024 * 1024));
    const usedMem = totalMem - freeMem;
    const cpuCount = os.cpus().length;

    // Approximate load average or cpu usage percentage
    const loadAvg = os.loadavg()[0];
    const cpuUsagePercent = Math.min(100, Math.round((loadAvg / (cpuCount || 1)) * 100));

    return {
      cpuCount: cpuCount || 1,
      cpuUsagePercent: isNaN(cpuUsagePercent) ? 0 : cpuUsagePercent,
      totalMemoryMb: totalMem,
      freeMemoryMb: freeMem,
      usedMemoryMb: usedMem,
      activeContainers: this.activeWorkloadIds.size,
    };
  }

  public getStatus(workerId: string): WorkerStatusReport {
    return {
      workerId,
      state: this.currentState,
      uptimeSeconds: Math.floor(process.uptime()),
      resources: this.getResources(),
      activeWorkloads: Array.from(this.activeWorkloadIds),
      timestamp: new Date().toISOString(),
    };
  }

  public setState(state: WorkerState): void {
    this.currentState = state;
  }

  public registerWorkload(workloadId: string): void {
    this.activeWorkloadIds.add(workloadId);
    if (this.currentState === 'idle') {
      this.currentState = 'busy';
    }
  }

  public unregisterWorkload(workloadId: string): void {
    this.activeWorkloadIds.delete(workloadId);
    if (this.activeWorkloadIds.size === 0 && this.currentState === 'busy') {
      this.currentState = 'idle';
    }
  }
}
