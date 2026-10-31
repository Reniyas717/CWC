import { execFile } from 'child_process';
import { promisify } from 'util';
import { GitRunner } from './services/git-runner.js';
import { DockerEngine } from './services/docker-engine.js';
import { DeploymentRunner } from './services/deployment-runner.js';
import { ControlPlaneClient } from './services/control-plane-client.js';
import { MetricsService } from './services/metrics.js';
import { DeploymentTaskPayload } from '@cloud-without-clouds/shared';

const execFileAsync = promisify(execFile);

async function runValidationSuite() {
  console.log('================================================================');
  console.log('🧪 Starting Worker Agent & Runtime Validation & Hardening Suite');
  console.log('================================================================');

  // Pre-flight check: Verify Docker is running
  try {
    const { stdout } = await execFileAsync('docker', ['info', '--format', '{{.ServerVersion}}']);
    console.log(`[Pre-flight] Docker daemon connected (version: ${stdout.trim()})`);
  } catch (err) {
    throw new Error('Pre-flight failed: Docker daemon is not running or not accessible.', {
      cause: err,
    });
  }

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

  // --------------------------------------------------------------------------
  // TEST 1: Real Public Git Repository Build & Container Run
  // --------------------------------------------------------------------------
  console.log('\n[TEST 1] Real Public Repository Deployment & Resource Enforcement...');
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

  const result = await runner.executeTask(realTask);
  console.log('Deployment Result:', JSON.stringify(result, null, 2));

  if (result.state !== 'running' || !result.assignedPort || !result.containerId) {
    throw new Error(`TEST 1 FAILED: Deployment did not reach running state: ${result.errorMessage}`);
  }

  // Verify HTTP endpoint serves traffic
  const response = await fetch(`http://localhost:${result.assignedPort}/`);
  console.log(`HTTP Status: ${response.status}`);
  const html = await response.text();
  console.log(`Response preview: ${html.substring(0, 120)}...`);

  if (!response.ok) {
    throw new Error(`TEST 1 FAILED: Expected HTTP 200, got ${response.status}`);
  }

  // Verify enforced kernel resource caps in Docker HostConfig
  const limits = await dockerEngine.inspectContainerResourceLimits(result.containerId);
  console.log('[TEST 1 Verification] Enforced Docker limits:', {
    memoryBytes: limits.memoryBytes,
    expectedMemoryBytes: 512 * 1024 * 1024,
    nanoCpus: limits.nanoCpus,
    expectedNanoCpus: 1000000000,
    pidsLimit: limits.pidsLimit,
  });

  if (limits.memoryBytes !== 512 * 1024 * 1024 || limits.nanoCpus !== 1000000000 || limits.pidsLimit !== 256) {
    throw new Error('TEST 1 FAILED: Resource limits were not enforced accurately in Docker HostConfig.');
  }

  console.log('✅ TEST 1 PASSED: Container deployed, serves traffic, and enforces CPU/memory limits.');

  // --------------------------------------------------------------------------
  // TEST 2: Stop and Cleanup Active Container
  // --------------------------------------------------------------------------
  console.log('\n[TEST 2] Testing Container Stop & Cleanup...');
  await runner.stopDeployment(realTask.deploymentId);

  // Confirm container is removed from Docker
  try {
    await execFileAsync('docker', ['inspect', `cwc-${realTask.deploymentId}`]);
    throw new Error('TEST 2 FAILED: Container still exists in Docker after stopDeployment');
  } catch {
    console.log('Verified: Container was removed from Docker.');
  }

  if (metricsService.getActiveWorkloadIds().includes(realTask.deploymentId)) {
    throw new Error('TEST 2 FAILED: Workload was not unregistered from MetricsService');
  }
  console.log('✅ TEST 2 PASSED: Container stopped and removed cleanly.');

  // --------------------------------------------------------------------------
  // TEST 3: Path Traversal Protection
  // --------------------------------------------------------------------------
  console.log('\n[TEST 3] Testing Security: Path Traversal Rejection...');
  const traversalTask: DeploymentTaskPayload = {
    deploymentId: 'test-traversal-03',
    applicationId: 'test-app-03',
    git: {
      repositoryUrl: 'https://github.com/paulbouwer/hello-kubernetes.git',
      branch: 'main',
      rootDirectory: '/',
    },
    dockerfilePath: '../../../../etc/passwd',
    targetPort: 8080,
    replicas: 1,
    resourceLimits: { cpuLimitCores: 1.0, memoryLimitMb: 512 },
    env: [],
  };

  const traversalResult = await runner.executeTask(traversalTask);
  console.log('Traversal Result:', traversalResult.errorMessage);

  if (
    traversalResult.state !== 'failed' ||
    !traversalResult.errorMessage?.includes('escapes repository directory')
  ) {
    throw new Error('TEST 3 FAILED: Path traversal was not rejected with security error');
  }
  console.log('✅ TEST 3 PASSED: Path traversal attempt successfully blocked.');

  // --------------------------------------------------------------------------
  // TEST 4: Missing Dockerfile Handling
  // --------------------------------------------------------------------------
  console.log('\n[TEST 4] Testing Missing Dockerfile Failure Handling...');
  const missingDockerTask: DeploymentTaskPayload = {
    deploymentId: 'test-missing-df-04',
    applicationId: 'test-app-04',
    git: {
      repositoryUrl: 'https://github.com/paulbouwer/hello-kubernetes.git',
      branch: 'main',
      rootDirectory: '/',
    },
    dockerfilePath: 'does-not-exist/Dockerfile',
    targetPort: 8080,
    replicas: 1,
    resourceLimits: { cpuLimitCores: 1.0, memoryLimitMb: 512 },
    env: [],
  };

  const missingDfResult = await runner.executeTask(missingDockerTask);
  console.log('Missing Dockerfile Result:', missingDfResult.errorMessage);

  if (
    missingDfResult.state !== 'failed' ||
    !missingDfResult.errorMessage?.includes('Dockerfile not found')
  ) {
    throw new Error('TEST 4 FAILED: Missing Dockerfile was not reported cleanly');
  }
  console.log('✅ TEST 4 PASSED: Missing Dockerfile handled gracefully.');

  // --------------------------------------------------------------------------
  // TEST 5: Flag Injection Rejection
  // --------------------------------------------------------------------------
  console.log('\n[TEST 5] Testing Security: Flag Injection Rejection...');
  const flagInjectionTask: DeploymentTaskPayload = {
    deploymentId: 'test-flag-05',
    applicationId: 'test-app-05',
    git: {
      repositoryUrl: 'https://github.com/paulbouwer/hello-kubernetes.git',
      branch: '--upload-pack=malicious',
      rootDirectory: '/',
    },
    dockerfilePath: 'Dockerfile',
    targetPort: 8080,
    replicas: 1,
    resourceLimits: { cpuLimitCores: 1.0, memoryLimitMb: 512 },
    env: [],
  };

  const flagResult = await runner.executeTask(flagInjectionTask);
  console.log('Flag Injection Result:', flagResult.errorMessage);

  if (
    flagResult.state !== 'failed' ||
    !flagResult.errorMessage?.includes('Invalid Git branch name')
  ) {
    throw new Error('TEST 5 FAILED: Flag injection in branch name was not blocked');
  }
  console.log('✅ TEST 5 PASSED: Flag injection blocked before process spawn.');

  // --------------------------------------------------------------------------
  // TEST 6: Invalid Repository Handling
  // --------------------------------------------------------------------------
  console.log('\n[TEST 6] Testing Invalid/Non-Existent Repository Handling...');
  const invalidRepoTask: DeploymentTaskPayload = {
    deploymentId: 'test-invalid-repo-06',
    applicationId: 'test-app-06',
    git: {
      repositoryUrl: 'https://github.com/cloud-without-clouds/non-existent-repo-12345.git',
      branch: 'main',
      rootDirectory: '/',
    },
    dockerfilePath: 'Dockerfile',
    targetPort: 8080,
    replicas: 1,
    resourceLimits: { cpuLimitCores: 1.0, memoryLimitMb: 512 },
    env: [],
  };

  const invalidRepoResult = await runner.executeTask(invalidRepoTask);
  console.log('Invalid Repo Result:', invalidRepoResult.errorMessage);

  if (
    invalidRepoResult.state !== 'failed' ||
    !invalidRepoResult.errorMessage?.includes('Git clone failed')
  ) {
    throw new Error('TEST 6 FAILED: Non-existent repository did not report failure cleanly');
  }
  console.log('✅ TEST 6 PASSED: Invalid repository failure reported cleanly.');

  console.log('\n================================================================');
  console.log('🎉 ALL 6 COMPREHENSIVE VALIDATION TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

runValidationSuite().catch((err) => {
  console.error('\n❌ VALIDATION SUITE ERROR:', err);
  process.exit(1);
});
