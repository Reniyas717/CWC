import { workerEnv } from './config/env.js';
import { WorkerHealthMonitor } from './modules/health/status.js';
import { DockerEngineModule } from './modules/docker/engine.js';
import { ControlPlaneClient } from './modules/control-plane/client.js';

async function main() {
  console.log(`
==================================================
🤖 Cloud Without Clouds - Distributed Worker Agent
==================================================
  Worker ID        : ${workerEnv.WORKER_ID}
  Worker Name      : ${workerEnv.WORKER_NAME}
  Control Plane    : ${workerEnv.CONTROL_PLANE_URL}
  Max Workloads    : ${workerEnv.MAX_CONCURRENT_WORKLOADS}
  Memory Limit     : ${workerEnv.TOTAL_MEMORY_LIMIT_MB} MB
==================================================
`);

  const healthMonitor = new WorkerHealthMonitor();
  const dockerEngine = new DockerEngineModule();
  const controlPlaneClient = new ControlPlaneClient(healthMonitor);

  await dockerEngine.initialize();

  // Initial resource inspection
  const initialResources = healthMonitor.getResources();
  console.log('[Worker Status] Host metrics:', {
    cpuCores: initialResources.cpuCount,
    totalMemory: `${initialResources.totalMemoryMb} MB`,
    freeMemory: `${initialResources.freeMemoryMb} MB`,
  });

  // Verify connection to control plane
  const isControlPlaneConnected = await controlPlaneClient.checkConnection();
  if (isControlPlaneConnected) {
    console.log(`[Worker Status] Control Plane reachable at ${workerEnv.CONTROL_PLANE_URL}`);
  } else {
    console.log(
      `[Worker Status] Control Plane currently offline at ${workerEnv.CONTROL_PLANE_URL} (will retry upon activation)`
    );
  }

  console.log('[Worker Ready] Worker agent initialized and awaiting deployment tasks.');

  // Handle graceful termination
  const shutdown = (signal: string) => {
    console.log(`\nReceived ${signal}, gracefully stopping worker agent...`);
    healthMonitor.setState('offline');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal worker error:', err);
  process.exit(1);
});
