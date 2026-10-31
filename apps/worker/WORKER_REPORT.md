# Technical Report: Worker Agent and Runtime (`apps/worker`)

**Project:** Cloud Without Clouds (`cloud-without-clouds`)  
**Track:** Bit N Build 2026 Finals — Team Pony  
**Subsystem:** Worker Agent & Runtime Workstream (Teammate 3)  
**Location:** [`apps/worker/`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker)  
**Date:** October 31, 2026  

---

## 1. Title & Project Context

### 1.1 Project Mission
**Cloud Without Clouds** is a distributed, self-service application hosting platform that enables developers to deploy applications from public Git repositories containing a Dockerfile directly onto developer-owned workstations and laptops acting as compute nodes across a private network mesh.

### 1.2 Workstream Scope: Teammate 3 (Worker Agent & Runtime)
Within the four-person hackathon team architecture, Teammate 3 is exclusively responsible for the distributed host agent running on compute provider machines (`apps/worker`). The scope covers:
- Host hardware and telemetry sampling (CPU ticks, memory, container count).
- Control Plane API communication (registration, non-overlapping heartbeat telemetry, task polling).
- Git repository isolation, cloning, and security validation.
- Docker image building and container lifecycle execution under strict resource caps.
- Dynamic ephemeral host port allocation and HTTP health verification.
- In-memory bounded log buffering and status reporting.
- Cancellation handling via abort signals and clean container/workspace teardown.

The workstream boundaries explicitly exclude frontend UI ([`apps/web`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/web)), database models and centralized scheduling ([`apps/api`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/api)), and edge ingress proxy routing (Caddy / Cloudflare Tunnel).

---

## 2. Overview & Architectural Fit

### 2.1 Role of the Worker Agent
The Worker Agent is an autonomous, non-privileged Node.js daemon running on a contributor's computer. It abstracts the host's local Docker daemon and operating system capabilities into a managed compute node for the platform.

```
+---------------------------------------------------------------------------------------+
|                                    CONTROL PLANE                                      |
|            (apps/api: Ingestion, Database Persistence, Scheduler, API Routes)          |
+---------------------------------------------------------------------------------------+
        ▲                                |                                 ▲
        | 1. Heartbeats & Registration   | 2. Task Polling                 | 3. Execution Results
        |    (POST /heartbeat)           |    (GET /workers/:id/tasks)     |    (POST /result & /logs)
        |                                v                                 |
+---------------------------------------------------------------------------------------+
|                                WORKER AGENT & RUNTIME                                 |
|                                     (apps/worker)                                     |
|                                                                                       |
|  +--------------------+     +---------------------+     +--------------------------+  |
|  |   MetricsService   |     |     TaskPoller      |     |     DeploymentRunner     |  |
|  |  (os.cpus, memory) |     | (3s poll interval)  |     |   (Abortable Pipeline)   |  |
|  +--------------------+     +---------------------+     +--------------------------+  |
|                                                                      |                |
|             +--------------------------------------------------------+                |
|             |                                                                         |
|             v                                                                         |
|  +--------------------+     +---------------------+     +--------------------------+  |
|  |     GitRunner      |     |    DockerEngine     |     |   ControlPlaneClient     |  |
|  | (Sandboxed clone)  | --> | (Build, Run & Caps) | --> | (Exponential Backoff)    |  |
|  +--------------------+     +---------------------+     +--------------------------+  |
|                                       |                                               |
+---------------------------------------|-----------------------------------------------+
                                        v
                       +---------------------------------+
                       |       HOST DOCKER ENGINE        |
                       |  - Enforced RAM limit (512MB)   |
                       |  - Enforced CPU cap (1.0 core)  |
                       |  - PID limit (256)              |
                       |  - Ephemeral port (-p 0:<port>) |
                       +---------------------------------+
```

### 2.2 Integration into Platform Flow
1. **Node Discovery:** On startup, the worker registers its capabilities (CPU cores, memory ceiling, workload limit) with the Control Plane.
2. **Health Telemetry:** The worker transmits resource utilization metrics every 10 seconds, providing the Control Plane scheduler with load data for placement decisions.
3. **Pull-Based Dispatch:** Rather than exposing open inbound ports on consumer firewalls, the worker polls the Control Plane API every 3 seconds for pending tasks.
4. **Execution & Routing Handoff:** Once a container is launched and passes HTTP health probing, the worker returns the dynamically assigned host port (`assignedPort`) and container ID to the Control Plane, which then configures edge proxy routes.

---

## 3. Architecture & Key Responsibilities

The worker implementation is organized into modular, decoupled services inside [`apps/worker/src/`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker/src):

### 3.1 Host Telemetry & Metrics Collection ([`MetricsService`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker/src/services/metrics.ts))
- **Cross-Platform CPU Utilization:** Samples system CPU tick deltas (`user`, `nice`, `sys`, `irq` vs. `total`) over intervals rather than relying on `os.loadavg()`, which returns `[0, 0, 0]` on Windows.
- **Memory Tracking:** Measures total, free, and used system memory in megabytes using Node.js `os` APIs.
- **Workload & State Management:** Tracks active deployment IDs; transitions worker state between `idle`, `busy` (active workloads), `draining`, and `offline`.

### 3.2 Control Plane Communication ([`ControlPlaneClient`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker/src/services/control-plane-client.ts))
- **Contract Enforcement:** Uses canonical Zod schemas from [`@cloud-without-clouds/shared`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/packages/shared).
- **Authentication:** Supplies `Authorization: Bearer <WORKER_SECRET_TOKEN>` on all requests.
- **Resilience & Retry Policy:** Wraps HTTP dispatches with exponential backoff (1s base, jitter, max 3 attempts) for transient connection drops.
- **Graceful Unimplemented Endpoint Tolerance:** Detects HTTP 501 / 404 responses from unimplemented API routes without crashing, logging diagnostic notices and falling back cleanly.

### 3.3 Task Poller ([`TaskPoller`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker/src/services/task-poller.ts))
- **Interval Dispatch:** Issues `GET /api/v1/workers/:id/tasks` every 3000ms.
- **Non-Blocking Execution:** Dispatches deployment tasks asynchronously so long-running Docker builds do not block subsequent polling cycles.
- **Directive Handling:** Routes `stop` / `cancel` instructions directly to the deployment runner.

### 3.4 Git Isolation & Security ([`GitRunner`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker/src/services/git-runner.ts))
- **Sandboxed Build Directories:** Clones source code into isolated directories (`%TEMP%/cwc-builds/<deploymentId>`).
- **Path Traversal Defense:** Verifies that resolved Dockerfile and build context paths do not escape the temporary clone root.
- **Git Flag Injection Defense:** Rejects branch/commit refs beginning with hyphens (e.g. `--upload-pack=...`) using regex validation before spawning `git`.
- **AbortSignal Support:** Connects `AbortSignal` to `execFile` so cancelling a deployment immediately terminates in-progress `git clone` processes.

### 3.5 Docker Runtime & Resource Enforcement ([`DockerEngine`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker/src/services/docker-engine.ts))
- **Mandatory Kernel Limits:** Starts all containers with hard resource constraints:
  - `--memory="<limit>m"` (default: 512 MB).
  - `--cpus="<limit>"` (default: 1.0 core).
  - `--pids-limit=256` (prevents fork-bomb exhaustion).
  - `--restart=on-failure:3` (guards against infinite crash loops).
- **Kernel Limit Verification:** Executes `docker inspect` post-launch to verify that `Memory`, `NanoCpus`, and `PidsLimit` match configured quotas at the kernel cgroup level.
- **Dynamic Ephemeral Port Allocation:** Uses `-p 0:<targetPort>` to let the operating system assign an available ephemeral port. The allocated port is resolved via `docker inspect` and returned, eliminating host port collisions.
- **HTTP Health Verification:** Periodically probes `http://localhost:<assignedPort><healthCheckPath>` (up to 10 attempts) to ensure the service is responsive before declaring success.
- **Orphan Container Reconciliation:** Runs `reconcileExistingContainers()` at boot to discover and prune containers labeled `cwc.deploymentId` left behind by ungraceful host crashes.

### 3.6 Deployment Pipeline & Cancellation ([`DeploymentRunner`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker/src/services/deployment-runner.ts))
- **Orchestration:** Executes the sequential pipeline: Git clone $\to$ Docker build $\to$ Docker run $\to$ Health check $\to$ Report result.
- **Abortable Executions:** Retains an active `AbortController` per deployment. Invoking `stopDeployment(id)` triggers immediate cancellation of the active Git clone or Docker build.
- **Bounded Log Capture:** Captures stdout/stderr into ring buffers capped at 500 lines to prevent unbounded memory growth during high-verbosity builds.

---

## 4. End-to-End Deployment Lifecycle

```text
  [Task Poller]
       │
       ▼
 [Execute Task] ──► Duplicate Check ──► (Reject if already executing)
       │
       ▼
  [Git Clone] ───► Validate Ref & Paths ──► Shallow Clone into %TEMP%/cwc-builds/<id>
       │              (Reject traversal / flag injection)
       ▼
 [Docker Build] ─► Resolve Dockerfile ──► docker build -t cwc-<id>:latest
       │              (Validate existence & boundaries)
       ▼
  [Docker Run] ──► Enforce Resource Caps ──► -p 0:<port> --memory=512m --cpus=1.0 --pids-limit=256
       │
       ▼
[Verify Health] ─► HTTP GET http://localhost:<port>/ (up to 10 retries)
       │
       ├─────────────────────────────────┬─────────────────────────────────┐
       ▼ (Success)                       ▼ (Health Check Failed)           ▼ (Aborted / Stopped)
  Report Running                   Report Failed                     Abort Signal Triggered
  - state: 'running'               - state: 'failed'                 - Clean up workspace
  - assignedPort: <port>           - errorMessage: <reason>          - Force remove container
  - containerId: <id>              - Clean up container              - state: 'stopped'
  - Clean up workspace git dir     - Clean up workspace git dir      - Report stopped
```

### Failure Modes & Handling:
- **Path Traversal Attempt:** Caught before Docker build begins; raises `Security Error: Dockerfile path escapes repository directory` and records failure.
- **Flag Injection Attempt:** Caught before Git execution starts; raises `Invalid Git branch name` and rejects task.
- **Missing Dockerfile:** Validates path existence before invoking Docker; logs explicit error and reports failure.
- **Application Crash / Health Timeout:** Retries HTTP GET 10 times with exponential delay; on persistent failure, force-removes container and reports failure.
- **Manual Stop / Cancel:** `DeploymentRunner.stopDeployment()` signals the `AbortController`, terminates subprocesses, force-removes the Docker container, and notifies the Control Plane.

---

## 5. Technology Stack & Dependencies

| Technology | Version / Source | Purpose |
| :--- | :--- | :--- |
| **Node.js** | `>= 20.0.0` (ESM) | Core runtime environment |
| **TypeScript** | `^5.8.2` | Strict type safety (`NodeNext` module resolution) |
| **Zod** | `^3.24.2` | Runtime schema validation for configuration and API payloads |
| **@cloud-without-clouds/shared** | Monorepo Workspace | Canonical source of truth for all domain models and schemas |
| **Docker Engine & CLI** | `28.3.2` (Verified) | Containerization engine, cgroup enforcement, and runtime isolation |
| **Git CLI** | System PATH | Version control cloning and revision resolution |
| **tsup** | `^8.4.0` | Fast ESM bundling and distribution compilation |
| **tsx** | `^4.19.3` | Native TypeScript script execution and live development watcher |
| **ESLint** | `^10.14.0` | Code quality enforcement and static analysis |

---

## 6. Setup, Configuration & Execution

### 6.1 Prerequisites
- **Node.js:** `v20+` or `v22+` installed.
- **pnpm:** `v9+` or `v10+` installed.
- **Docker Engine:** Docker Desktop or `dockerd` running and accessible to the current user.
- **Git:** Available on system PATH.

### 6.2 Configuration Parameters ([`apps/worker/src/config.ts`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker/src/config.ts))
Loaded from `.env` and strictly validated at process start:

| Environment Variable | Default Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | Environment mode (`development`, `production`, `test`) |
| `WORKER_ID` | `worker-node-local-01` | Unique node identifier within the platform mesh |
| `WORKER_NAME` | `Local Development Worker` | Display name for the dashboard |
| `WORKER_PORT` | `5001` | Worker metadata port |
| `CONTROL_PLANE_URL` | `http://localhost:4000` | Target URL for the Express Control Plane API |
| `WORKER_SECRET_TOKEN` | *Development token* | Bearer authentication secret |
| `MAX_CONCURRENT_WORKLOADS` | `4` | Maximum parallel containers allowed on this node |
| `TOTAL_MEMORY_LIMIT_MB` | `4096` | Upper memory limit reported to scheduler |
| `MAX_CPU_CORES` | Host core count | CPU core capacity reported to scheduler |
| `HEARTBEAT_INTERVAL_MS` | `10000` | Heartbeat interval (10,000ms = 10s) |
| `MAX_RETRIES` | `3` | Maximum API client retries upon connection failure |
| `RETRY_BACKOFF_MS` | `1000` | Base delay for exponential backoff (1s) |
| `LOG_LEVEL` | `info` | Logging verbosity (`debug`, `info`, `warn`, `error`) |

### 6.3 Local Execution Commands
```bash
# 1. Install dependencies from workspace root
pnpm install

# 2. Build shared contracts
pnpm --filter @cloud-without-clouds/shared build

# 3. Start worker agent in development mode (live reload)
pnpm dev:worker
# or from apps/worker directory:
pnpm dev

# 4. Build and run production bundle
pnpm --filter @cloud-without-clouds/worker build
pnpm --filter @cloud-without-clouds/worker start
```

---

## 7. Testing, Verification & Evidence

The worker agent was subjected to automated verification, static analysis, and end-to-end integration tests using a real Docker daemon and a live public Git repository.

### 7.1 Verification Checklist & Status

| Verification Category | Command Executed | Result | Status |
| :--- | :--- | :--- | :--- |
| **TypeScript Typecheck** | `pnpm --filter @cloud-without-clouds/worker check-types` | Exit 0, 0 errors | **PASSED** |
| **Static Code Linting** | `pnpm --filter @cloud-without-clouds/worker lint` | Exit 0, 0 errors, 0 warnings | **PASSED** |
| **Worker Production Build** | `pnpm --filter @cloud-without-clouds/worker build` | Compiled `dist/index.js` (47.99 KB) in 85ms | **PASSED** |
| **Shared Contracts Build** | `pnpm --filter @cloud-without-clouds/shared build` | CJS, ESM, and DTS compiled in 3072ms | **PASSED** |
| **Runtime Docker Test Suite** | `pnpm --filter @cloud-without-clouds/worker test` | 6/6 tests passed | **PASSED** |

### 7.2 Detailed Results: Automated Runtime Suite ([`apps/worker/src/test-docker-runtime.ts`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker/src/test-docker-runtime.ts))

All 6 test cases executed against active Docker daemon `28.3.2`:

```text
================================================================
🧪 Starting Worker Agent & Runtime Validation & Hardening Suite
================================================================
[Pre-flight] Docker daemon connected (version: 28.3.2)

[TEST 1] Real Public Repository Deployment & Resource Enforcement
• Cloned: https://github.com/paulbouwer/hello-kubernetes.git (commit b3a061ba28f0a9513f800272974d8537b58c0350)
• Build: Successfully generated Docker image cwc-test-real-dep-01:latest
• Container Launch: Container 03a9ad50524c started on host port 32771
• Kernel Limit Verification (docker inspect):
  - Memory Limit: 536,870,912 bytes (512.0 MB) -> Matches expectation
  - NanoCPUs: 1,000,000,000 (1.0 Core) -> Matches expectation
  - PidsLimit: 256 -> Matches expectation
• Health Check: Verified HTTP 200 OK on http://localhost:32771/
✅ TEST 1 PASSED: Container deployed, serves traffic, and enforces CPU/memory limits.

[TEST 2] Container Stop & Resource Cleanup
• Invocations: DeploymentRunner.stopDeployment('test-real-dep-01')
• Verification: Container 03a9ad50524c verified stopped and removed from Docker daemon
✅ TEST 2 PASSED: Container stopped and removed cleanly.

[TEST 3] Security: Path Traversal Rejection
• Input: dockerfilePath = "../../../../etc/passwd"
• Result: Blocked prior to build. Error: "Security Error: Dockerfile path escapes repository directory."
✅ TEST 3 PASSED: Path traversal attempt successfully blocked.

[TEST 4] Error Handling: Missing Dockerfile
• Input: dockerfilePath = "does-not-exist/Dockerfile"
• Result: Caught cleanly. Error: "Dockerfile not found at resolved path"
✅ TEST 4 PASSED: Missing Dockerfile handled gracefully and status reported.

[TEST 5] Security: Git Flag Injection Defense
• Input: branch = "--upload-pack=malicious"
• Result: Blocked prior to subprocess execution. Error: "Invalid Git branch name"
✅ TEST 5 PASSED: Flag injection blocked before process spawn.

[TEST 6] Error Handling: Non-Existent Repository
• Input: https://github.com/cloud-without-clouds/non-existent-repo-12345.git
• Result: Git clone error captured; failed state reported without worker crash
✅ TEST 6 PASSED: Invalid repository failure reported cleanly.

================================================================
🎉 ALL 6 COMPREHENSIVE VALIDATION TESTS PASSED SUCCESSFULLY!
================================================================
```

---

## 8. Limitations, Known Dependencies & Next Steps

### 8.1 Current Worker-Side Scope Boundaries
- **Single Host Concurrency:** Configured by default for up to 4 concurrent workloads per host node.
- **Docker Daemon Dependency:** The host machine must have Docker installed and running; rootless Docker or containerless sandboxes (e.g. gVisor / Firecracker) are not implemented for the MVP.
- **Ephemeral Port Demux:** Port binding relies on host network ephemeral allocation (`-p 0:<port>`), requiring upstream proxy synchronization.

### 8.2 External API Dependencies (Handoff for Teammate 2)
The worker agent implementation is complete and resilient, but full end-to-end integration across the platform depends on Teammate 2 completing the following items in `apps/api`:
1. **Dependency Installation in `apps/api/package.json`:**  
   Commit `4559938` introduced references to `drizzle-orm`, `drizzle-zod`, and `pg` in `apps/api/src/db/` without adding them to `apps/api/package.json`. These must be installed so workspace-wide `pnpm check-types` passes.
2. **Control Plane Route Handlers:**  
   The worker's requests to `POST /api/v1/workers/register` (currently returning 501), `POST /api/v1/workers/heartbeat` (404), `GET /api/v1/workers/:id/tasks` (404), and `POST /api/v1/internal/deployments/:id/result` (404) are ready for consumption as soon as the API handlers are mounted.

### 8.3 Ingress Routing Dependencies (Handoff for Teammate 4)
- When a container is running, the worker reports the assigned host port via `DeploymentResultPayload.assignedPort`.
- Teammate 4's Caddy reverse proxy or Cloudflare Quick Tunnel must forward public requests for that deployment to `http://<worker-tailscale-ip>:<assignedPort>`.

---

## 9. Conclusion

The **Worker Agent and Runtime (`apps/worker`)** workstream is complete, hardened, and verified. 

The worker reliably samples host hardware telemetry, maintains non-overlapping heartbeat loops, polls for deployment tasks, enforces kernel resource quotas (RAM, CPU, PID caps), isolates Git builds, defends against injection attacks, allocates dynamic ports without collisions, verifies HTTP health, and terminates workloads cleanly without leaving orphaned processes or containers. 

All source code, tests, and documentation are committed and pushed to `main`, ready for multi-node evaluation.
