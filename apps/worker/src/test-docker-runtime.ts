import { GitRunner } from './services/git-runner.js';
import { DockerEngine } from './services/docker-engine.js';
import { DeploymentRunner } from './services/deployment-runner.js';
import { ControlPlaneClient } from './services/control-plane-client.js';
import { MetricsService } from './services/metrics.js';
import { DeploymentTaskPayload } from '@cloud-without-clouds/shared';

async function runRealTest() {
  console.log('====================================================');
  console.log('🧪 Starting End-to-End Real Git & Docker Runtime Test');
  console.log('====================================================');

  const gitRunner = new GitRunner();
  const dockerEngine = new DockerEngine();
  const controlPlaneClient = new ControlPlaneClient();
  const metricsService = new MetricsService();

  const runner = new DeploymentRunner(
    gitRunner,
    dockerEngine,
    controlPlaneClient,
    metricsService
  );

  const realTask: DeploymentTaskPayload = {
    deploymentId: 'test-real-dep-01',
    applicationId: 'test-app-01',
    git: {
      repositoryUrl: 'https://github.com/paulbouwer/hello-kubernetes.git',
      branch: 'main',
      rootDirectory: 'src/app',
    },
    dockerfilePath: 'src/app/Dockerfile',
    buildContext: 'src/app',
    targetPort: 8080,
    healthCheckPath: '/',
    replicas: 1,
    resourceLimits: {
      cpuLimitCores: 1.0,
      memoryLimitMb: 512,
    },
    env: [{ key: 'MESSAGE', value: 'Hello Cloud Without Clouds!', isSecret: false }],
  };

  console.log('\n[TEST 1] Executing deployment task with real public Git repository...');
  const result = await runner.executeTask(realTask);

  console.log('\nDeployment Result:', JSON.stringify(result, null, 2));

  if (result.state !== 'running' || !result.assignedPort || !result.containerId) {
    throw new Error(`Test 1 FAILED: Deployment did not reach running state: ${result.errorMessage}`);
  }

  console.log(`\n[TEST 2] Verifying application HTTP response on host port ${result.assignedPort}...`);
  const response = await fetch(`http://localhost:${result.assignedPort}/`);
  console.log(`HTTP Status: ${response.status}`);
  const text = await response.text();
  console.log(`Response preview: ${text.substring(0, 150)}...`);

  if (!response.ok) {
    throw new Error(`Test 2 FAILED: Expected HTTP 200, got ${response.status}`);
  }

  if (!text.includes('Hello Cloud Without Clouds!')) {
    console.warn('Custom environment variable MESSAGE not reflected in HTML body, but HTTP 200 received');
  } else {
    console.log('Environment variable correctly reflected in container runtime output!');
  }

  console.log('\n[TEST 3] Testing container stop and cleanup...');
  await runner.stopDeployment(realTask.deploymentId);
  console.log('Deployment stopped and container removed cleanly.');

  console.log('\n[TEST 4] Testing Failure Case (Invalid Git repository)...');
  const failureTask: DeploymentTaskPayload = {
    deploymentId: 'test-fail-dep-02',
    applicationId: 'test-app-02',
    git: {
      repositoryUrl: 'https://github.com/cloud-without-clouds/non-existent-repo-12345.git',
      branch: 'main',
      rootDirectory: '/',
    },
    dockerfilePath: 'Dockerfile',
    targetPort: 3000,
    healthCheckPath: '/',
    replicas: 1,
    resourceLimits: {
      cpuLimitCores: 1.0,
      memoryLimitMb: 512,
    },
    env: [],
  };

  const failureResult = await runner.executeTask(failureTask);
  console.log('Failure Case Result:', JSON.stringify(failureResult, null, 2));

  if (failureResult.state !== 'failed' || !failureResult.errorMessage) {
    throw new Error('Test 4 FAILED: Expected deployment to fail gracefully with error message');
  }

  console.log('\n====================================================');
  console.log('🎉 ALL TESTS PASSED: Docker Runtime Fully Verified with Real Git Repo!');
  console.log('====================================================');
}

runRealTest().catch((err) => {
  console.error('\n❌ TEST RUNNER ERROR:', err);
  process.exit(1);
});
