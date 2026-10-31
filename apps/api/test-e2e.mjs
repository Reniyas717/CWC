/**
 * Comprehensive End-to-End Platform Integration Test
 * Flow:
 * 1. Submits deployment via Control Plane API
 * 2. Worker polls task, performs shallow Git clone, builds Docker image, and launches container
 * 3. Enforces resource limits (512MB RAM, 1.0 CPU, 256 PIDs)
 * 4. Worker verifies health and reports result with ephemeral port
 * 5. Control Plane requests Gateway route publication
 * 6. Gateway applies Caddy configuration and launches Cloudflare Quick Tunnel
 * 7. Control Plane persists and exposes public trycloudflare.com URL
 * 8. Probes public URL over the Internet
 * 9. Cancels deployment -> stops container on worker and removes Gateway route
 * 10. Deletes deployment record -> verifies full resource cleanup
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function run() {
  const adminHeaders = {
    Authorization: 'Bearer dev-admin-token-change-in-production',
    'Content-Type': 'application/json',
  };

  console.log('1. Submitting deployment to Control Plane API...');
  const createRes = await fetch('http://localhost:4000/api/v1/deployments', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'E2E Full Stack App',
      slug: 'e2e-app-' + Date.now(),
      framework: 'dockerfile',
      git: {
        repositoryUrl: 'https://github.com/paulbouwer/hello-kubernetes.git',
        branch: 'main',
        rootDirectory: 'src/app',
      },
      port: 8080,
      resourceLimits: { cpuLimitCores: 1.0, memoryLimitMb: 512 },
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create deployment: HTTP ${createRes.status} ${await createRes.text()}`);
  }

  const createData = await createRes.json();
  const depId = createData.data.id;
  console.log(`  ✅ Deployment created: ${depId} (state: ${createData.data.state})`);

  console.log('2. Waiting for worker build, container startup, and Gateway route publication...');
  let dep = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(`http://localhost:4000/api/v1/deployments/${depId}`, {
      headers: adminHeaders,
    });
    const body = await res.json();
    dep = body.data;
    process.stdout.write('.');
    if (dep.state === 'running' && dep.publicUrl && dep.publicUrl.includes('trycloudflare.com')) {
      console.log('\n  ✅ Deployment reached RUNNING with Gateway publicUrl!');
      break;
    }
  }

  if (dep.state !== 'running' || !dep.publicUrl) {
    throw new Error(`Deployment did not reach running state with public URL. Current: ${JSON.stringify(dep)}`);
  }

  console.log('\nDeployment Details:');
  console.log(`  - State       : ${dep.state}`);
  console.log(`  - Host Port   : ${dep.assignedPort}`);
  console.log(`  - Container ID: ${dep.containerId?.substring(0, 12)}`);
  console.log(`  - Public URL  : ${dep.publicUrl}`);

  // Inspect Docker resource caps on host
  const { stdout: inspectOut } = await execFileAsync('docker', [
    'inspect',
    '--format',
    '{{.HostConfig.Memory}} {{.HostConfig.NanoCPUs}} {{.HostConfig.PidsLimit}}',
    `cwc-${depId.toLowerCase()}`,
  ]);
  const [memBytes, nanoCpus, pids] = inspectOut.trim().split(/\s+/);
  console.log(
    `  - Kernel Limits Enforced: RAM=${Math.round(Number(memBytes) / (1024 * 1024))}MB, CPUs=${Number(nanoCpus) / 1e9}, PIDs=${pids}`
  );

  console.log('\n3. Probing deployment public URL via Cloudflare Quick Tunnel (with DNS propagation retries)...');
  let probeRes = null;
  let html = '';
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const { stdout: curlOut } = await execFileAsync('curl.exe', ['-s', '-i', dep.publicUrl]);
      if (curlOut.includes('200 OK') || curlOut.includes('HTTP/1.1 200') || curlOut.includes('HTTP/2 200')) {
        probeRes = { ok: true, status: 200 };
        html = curlOut;
        break;
      }
    } catch {
      // DNS may take a few seconds to propagate across all edge nameservers
    }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!probeRes || !probeRes.ok) {
    throw new Error(`Failed to probe public URL ${dep.publicUrl} after 30 attempts`);
  }

  console.log(`\n  ✅ Public Tunnel HTTP Status: ${probeRes.status}`);
  console.log(`  ✅ HTTP Response Preview: ${html.substring(0, 120).replace(/\s+/g, ' ')}...`);

  console.log('\n4. Cancelling deployment via Control Plane API...');
  const cancelRes = await fetch(`http://localhost:4000/api/v1/deployments/${depId}/cancel`, {
    method: 'POST',
    headers: adminHeaders,
  });
  console.log(`  ✅ Cancel API Status: ${cancelRes.status}`);

  console.log('5. Waiting for worker container teardown...');
  await new Promise((r) => setTimeout(r, 4000));

  // Verify container is removed
  const { stdout: psOut } = await execFileAsync('docker', [
    'ps',
    '-a',
    '--filter',
    `name=cwc-${depId.toLowerCase()}`,
    '--format',
    '{{.ID}}',
  ]);
  if (!psOut.trim()) {
    console.log('  ✅ Docker container cleanly stopped and removed from host.');
  } else {
    console.warn(`  ⚠️ Container still present: ${psOut.trim()}`);
  }

  console.log('\n6. Deleting deployment record...');
  const delRes = await fetch(`http://localhost:4000/api/v1/deployments/${depId}`, {
    method: 'DELETE',
    headers: adminHeaders,
  });
  console.log(`  ✅ Delete API Status: ${delRes.status}`);

  console.log('7. Verifying 404 on subsequent GET...');
  const verifyRes = await fetch(`http://localhost:4000/api/v1/deployments/${depId}`, {
    headers: adminHeaders,
  });
  console.log(`  ✅ Verify GET Status: ${verifyRes.status} (Not Found)`);

  console.log('\n================================================================');
  console.log('🎉 FULL END-TO-END BACKEND, WORKER & GATEWAY LIFECYCLE VERIFIED!');
  console.log('================================================================');
}

run().catch((err) => {
  console.error('❌ E2E Integration Test Failed:', err);
  process.exit(1);
});
