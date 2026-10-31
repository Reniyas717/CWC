# Distributed Worker Agent (`@cloud-without-clouds/worker`)

The **Distributed Worker Agent** is the local execution daemon of the **Cloud Without Clouds** platform. It runs on developer workstations and laptops, periodically reporting host telemetry to the Control Plane API, polling for container deployment tasks, pulling Git repositories, building Docker images, and running containers with hard resource quotas and ephemeral port bindings.

---

## 1. Purpose & Responsibilities

- **Host Telemetry & Heartbeats:** Samples CPU usage, total/used/free memory, and active container counts; transmits heartbeats every 10 seconds (configurable) to `POST /api/v1/workers/heartbeat`.
- **Task Polling:** Polls `GET /api/v1/workers/:id/tasks` every 3 seconds for new deployment tasks or stop/cancel directives.
- **Git Orchestration:** Clones public Git repositories into isolated temporary workspace directories (`cwc-builds/<deployment-id>`) with validation against Git flag injection and path traversal.
- **Docker Container Lifecycle:** Builds images using the repository Dockerfile, executes containers with mandatory resource limits (`--memory`, `--cpus`, `--pids-limit=256`), and binds to an ephemeral host port (`-p 0:<targetPort>`).
- **Health Verification:** Probes the running container over HTTP (`/` or custom `healthCheckPath`) to confirm readiness before reporting status.
- **Result & Log Reporting:** Flushes stdout/stderr build and runtime logs (capped at 500 lines) and final deployment results (`POST /api/v1/internal/deployments/:id/result`).
- **Lifecycle Cleanup & Reconciliation:** On startup, cleans up any orphan `cwc-` containers from previous crashes; on `SIGINT`/`SIGTERM` or stop task, halts and removes active containers cleanly.

---

## 2. Prerequisites

| Dependency | Minimum Version | Verification Command | Notes |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v20.0.0+` or `v22.0.0+` | `node -v` | ESM support required |
| **pnpm** | `v9.0.0+` or `v10.0.0+` | `pnpm -v` | Monorepo package manager |
| **Docker Engine / CLI** | `v24.0.0+` | `docker version` | Docker daemon must be running |
| **Git** | `v2.30.0+` | `git version` | Required on system PATH |

---

## 3. Configuration & Environment Variables

The worker loads environment variables from the root `.env` or local `.env` via `dotenv` and validates them at startup with Zod:

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `development \| production \| test` | `development` | Operating environment |
| `WORKER_ID` | `string` | `worker-node-local-01` | Unique identifier for this worker node |
| `WORKER_NAME` | `string` | `Local Development Worker` | Human-readable node display name |
| `WORKER_PORT` | `number` | `5001` | Local port metadata reported during registration |
| `CONTROL_PLANE_URL` | `string (URL)` | `http://localhost:4000` | Base URL of the Express Control Plane API |
| `WORKER_SECRET_TOKEN` | `string (min 8)` | `dev-worker-secret-token-change-in-production` | Bearer token used for worker API authentication |
| `MAX_CONCURRENT_WORKLOADS` | `number` | `4` | Maximum parallel containers this worker will host |
| `TOTAL_MEMORY_LIMIT_MB` | `number` | `4096` | Upper memory limit reported to scheduler |
| `MAX_CPU_CORES` | `number` | Host CPU core count | Maximum CPU cores reported to scheduler |
| `HEARTBEAT_INTERVAL_MS` | `number` | `10000` (10s) | Interval between telemetry heartbeat dispatches |
| `MAX_RETRIES` | `number` | `3` | Maximum API client retries upon network error |
| `RETRY_BACKOFF_MS` | `number` | `1000` (1s) | Exponential backoff base for API client retries |
| `LOG_LEVEL` | `debug \| info \| warn \| error` | `info` | Minimum log level printed to console |

*Note: All sensitive tokens (`WORKER_SECRET_TOKEN`, `authToken`, `Authorization`) are automatically redacted in worker console logs (`***REDACTED***`).*

---

## 4. How to Run the Worker Locally

### Install Dependencies
From the repository root:
```bash
pnpm install
```

### Build Shared Package
The worker depends on `@cloud-without-clouds/shared`. Build it once:
```bash
pnpm --filter @cloud-without-clouds/shared build
```

### Start in Development Mode (Live Watch)
```bash
# From repository root:
pnpm dev:worker

# Or from within apps/worker:
pnpm dev
```

### Build & Run Production Bundle
```bash
pnpm --filter @cloud-without-clouds/worker build
pnpm --filter @cloud-without-clouds/worker start
```

---

## 5. Verification & Testing

### Typecheck & Lint
```bash
pnpm --filter @cloud-without-clouds/worker check-types
pnpm --filter @cloud-without-clouds/worker lint
```

### Execute Runtime & Validation Suite
The runtime test suite validates all core capabilities against the live Docker daemon:
```bash
pnpm --filter @cloud-without-clouds/worker test
# Or:
pnpm --filter @cloud-without-clouds/worker test:runtime
```

The test suite covers:
1. **Real Public Git Deployment:** Clones `https://github.com/paulbouwer/hello-kubernetes.git`, builds Docker image, runs container with resource limits, and performs HTTP health check.
2. **Container Stop & Teardown:** Verifies graceful stop and container pruning from Docker.
3. **Path Traversal Defense:** Confirms relative traversal attempts (`../../../../etc/passwd`) are blocked before build.
4. **Missing Dockerfile Handling:** Verifies non-existent Dockerfiles fail cleanly with structured error reporting.
5. **Git Flag Injection Defense:** Verifies branch names starting with dashes (`--upload-pack=...`) are rejected before process spawn.
6. **Non-Existent Repository Handling:** Verifies unreachable Git URLs are reported without worker crashes.

---

## 6. Architecture & Execution Flow

```text
               +-----------------------------+
               |  Control Plane (apps/api)   |
               +-----------------------------+
                    ^                   |
    1. Register &   |                   |  2. Poll Tasks
       Heartbeats   |                   |     (GET /tasks)
                    |                   v
          +--------------------------------------+
          |     Worker Agent (apps/worker)       |
          +--------------------------------------+
             |                  |              |
    3. Git Clone       4. Docker Build    5. Docker Run
    (Sandboxed /tmp)   (Tagged Image)     (--memory=512m, --cpus=1.0, -p 0:port)
             |                  |              |
             +------------------+--------------+
                                |
                    6. HTTP Health Probe (200 OK)
                                |
                    7. Report Result & Stream Logs
```

1. **Bootstrap & Reconciliation:**
   - Cleans up orphan `cwc-` containers from previous crashes.
   - Measures initial system memory and CPU usage.
   - Registers with the Control Plane (`POST /api/v1/workers/register`). If the API is offline or returns `501`, continues in resilient standby mode and retries registration during subsequent heartbeat cycles.
2. **Heartbeat Loop (`executeHeartbeat`):**
   - Dispatches resource metrics (`cpuUsagePercent`, `freeMemoryMb`, `activeWorkloadIds`) every 10 seconds.
   - Non-overlapping execution prevents timer stacking under slow network conditions.
3. **Task Poller (`TaskPoller`):**
   - Polls `GET /api/v1/workers/:id/tasks` every 3 seconds using `Authorization: Bearer <WORKER_SECRET_TOKEN>`.
   - Dispatches deployment tasks asynchronously to avoid blocking poll loops.
4. **Execution Pipeline (`DeploymentRunner`):**
   - **Isolation:** Clones code into temporary directories (`%TEMP%/cwc-builds/<id>`).
   - **Security Checks:** Verifies deployment ID characters, validates Git ref format, and asserts that resolved Dockerfile and build context remain inside the cloned workspace.
   - **Kernel Limits:** Runs containers with `--memory="<limit>m"`, `--cpus="<limit>"`, `--pids-limit=256`, and `--restart=on-failure:3`.
   - **Dynamic Ports:** Binds container to ephemeral host port (`-p 0:<targetPort>`), inspects Docker to retrieve the actual allocated host port, preventing port conflicts.
   - **Health Probing:** Periodically requests `http://localhost:<assignedPort>/` with retries until HTTP 200 is confirmed.
   - **Cleanup:** Purges cloned workspace directory and registers container ID for lifecycle tracking.
5. **Abort & Shutdown:**
   - Active deployments use `AbortController`; stop/cancel directives abort Git clones and Docker builds immediately.
   - `SIGTERM` / `SIGINT` signals invoke `cleanupAllContainers()`, stopping and removing all running containers before process exit.

---

## 7. Troubleshooting & Diagnostics

### Common Startup Issues

- **`Invalid worker environment configuration`**
  - **Cause:** One of the environment variables in `.env` failed Zod validation.
  - **Resolution:** Check terminal output for the specific variable name and constraint (e.g., `WORKER_SECRET_TOKEN` must be at least 8 characters; `CONTROL_PLANE_URL` must be a valid URL).

- **`Docker daemon is not running or accessible`**
  - **Cause:** Docker Desktop or `dockerd` is stopped, or the current user lacks permission to access the Docker pipe/socket.
  - **Resolution:** Start Docker Desktop or verify `docker ps` runs successfully from your terminal.

- **`Control Plane currently unreachable at http://localhost:4000. Starting in resilient standby mode.`**
  - **Cause:** The API service (`apps/api`) has not been started yet.
  - **Resolution:** Normal behavior. The worker will automatically retry registration during heartbeat intervals once `apps/api` comes online.

### Build & Runtime Failures

- **`Security Error: Dockerfile path escapes repository directory`**
  - **Cause:** Deployment payload specified a `dockerfilePath` or `buildContext` using relative paths (`../`) escaping the workspace.
  - **Resolution:** Ensure paths are relative to the root of the repository without escaping parents.

- **`Invalid Git branch name`**
  - **Cause:** Branch or commit ref starts with `-` or contains disallowed characters.
  - **Resolution:** Submit standard Git branch names (e.g., `main`, `release/v1.0`).

- **`Container failed health check on http://localhost:<port>/ after 10 attempts`**
  - **Cause:** The application inside the container either crashed, listens on a different internal port than `targetPort`, or takes longer to boot.
  - **Resolution:** Check container logs streamed back to the Control Plane to inspect the application crash trace.

---

## 8. Current Limitations & Teammate Handoff Notes

- **API Route Implementations (Teammate 2 - Control Plane):**
  - The worker uses canonical schemas from `@cloud-without-clouds/shared`.
  - Currently in `apps/api`, endpoints `/api/v1/workers/register` and `/api/v1/deployments` are `501 Not Implemented` stubs, while `/api/v1/workers/heartbeat`, `/api/v1/workers/:id/tasks`, `/api/v1/internal/deployments/:id/result`, and `/api/v1/internal/deployments/:id/logs` return `404 Not Found`.
  - The worker gracefully tolerates these statuses without crashing, retrying with exponential backoff. Once Teammate 2 wires the Drizzle ORM handlers, worker integration is fully operational out-of-the-box.
- **Edge Routing (Teammate 4 - Build & Ingress Pipeline):**
  - The worker binds containers to ephemeral host ports (`-p 0:<port>`) on `localhost` and reports `assignedPort` and `publicUrl` in the deployment result.
  - Teammate 4's Caddy reverse proxy or Cloudflare Quick Tunnel connects upstream to this reported host port over Tailscale.
