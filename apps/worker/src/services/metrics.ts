import os from 'os';
import { WorkerResources, WorkerResourcesSchema, WorkerState } from '@cloud-without-clouds/shared';
import { createLogger } from '../logger.js';

const logger = createLogger('MetricsService');

interface CpuSnapshot {
  idle: number;
  total: number;
  timestamp: number;
}

export class MetricsService {
  private lastCpuSnapshot: CpuSnapshot;
  private activeWorkloadIds: Set<string> = new Set();
  private currentState: WorkerState = 'idle';

  constructor() {
    this.lastCpuSnapshot = this.sampleCpu();
    logger.debug('Metrics service initialized', {
      cpuCount: os.cpus().length,
      initialMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
    });
  }

  private sampleCpu(): CpuSnapshot {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {
      idle += cpu.times.idle;
      total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
    }

    return {
      idle,
      total,
      timestamp: Date.now(),
    };
  }

  /**
   * Calculates CPU usage percentage across all cores since the last measurement.
   * Works across all platforms including Windows (where os.loadavg is not supported).
   */
  public calculateCpuUsage(): number {
    const current = this.sampleCpu();
    const deltaTotal = current.total - this.lastCpuSnapshot.total;
    const deltaIdle = current.idle - this.lastCpuSnapshot.idle;

    this.lastCpuSnapshot = current;

    if (deltaTotal > 0) {
      const busy = deltaTotal - deltaIdle;
      const usage = Math.min(100, Math.max(0, Math.round((busy / deltaTotal) * 100)));
      return isNaN(usage) ? 0 : usage;
    }

    // Fallback for systems supporting loadavg (Linux / macOS)
    const loadAvg = os.loadavg()[0];
    const cpuCount = os.cpus().length || 1;
    if (loadAvg > 0) {
      return Math.min(100, Math.max(0, Math.round((loadAvg / cpuCount) * 100)));
    }

    return 0;
  }

  public getResources(): WorkerResources {
    const totalMemoryMb = Math.round(os.totalmem() / (1024 * 1024));
    const freeMemoryMb = Math.round(os.freemem() / (1024 * 1024));
    const usedMemoryMb = Math.max(0, totalMemoryMb - freeMemoryMb);
    const cpuCount = Math.max(1, os.cpus().length);
    const cpuUsagePercent = this.calculateCpuUsage();

    const resources: WorkerResources = {
      cpuCount,
      cpuUsagePercent,
      totalMemoryMb,
      freeMemoryMb,
      usedMemoryMb,
      activeContainers: this.activeWorkloadIds.size,
    };

    return WorkerResourcesSchema.parse(resources);
  }

  public getState(): WorkerState {
    return this.currentState;
  }

  public setState(state: WorkerState): void {
    const oldState = this.currentState;
    this.currentState = state;
    if (oldState !== state) {
      logger.info(`Worker state changed: ${oldState} -> ${state}`);
    }
  }

  public getActiveWorkloadIds(): string[] {
    return Array.from(this.activeWorkloadIds);
  }

  public registerWorkload(workloadId: string): void {
    this.activeWorkloadIds.add(workloadId);
    logger.info(`Workload registered: ${workloadId}`, {
      activeWorkloadsCount: this.activeWorkloadIds.size,
    });
    if (this.currentState === 'idle') {
      this.setState('busy');
    }
  }

  public unregisterWorkload(workloadId: string): void {
    this.activeWorkloadIds.delete(workloadId);
    logger.info(`Workload unregistered: ${workloadId}`, {
      activeWorkloadsCount: this.activeWorkloadIds.size,
    });
    if (this.activeWorkloadIds.size === 0 && this.currentState === 'busy') {
      this.setState('idle');
    }
  }
}
