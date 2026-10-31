# Cloud Without Clouds: Comprehensive Project Status & Integration Audit

**Date:** October 31, 2026  
**Auditor:** Teammate 3 (Independent Architecture & Integration Audit)  
**Repository:** `cloud-without-clouds` (`Team-Pony_Final-Round`)  
**Commit Audited:** [`809e68c`](https://github.com/BnB-26-Final-Round/Team-Pony_Final-Round/commit/809e68c) (Branch `main`, fully synchronized with `origin/main`)

---

## 1. Executive Summary & Overall Readiness

### Overall System Readiness: **PARTIAL / BLOCKED AT INTEGRATION BOUNDARY**

The **Cloud Without Clouds** platform has made substantial progress across all four planned workstreams. The individual modules demonstrate strong engineering design, robust defensive programming, and alignment with the architecture specification. However, **the integrated system is currently blocked from running end-to-end due to three critical integration and runtime blockers:**

1. **Broken Monorepo Lockfile & Uninstalled Dependencies in API:** A merge conflict in `pnpm-lock.yaml` prevents `pnpm install` from completing with `--frozen-lockfile`. Consequently, newly added backend dependencies (`pg`, `drizzle-orm`, `ioredis`, `drizzle-zod`) are not installed in `node_modules`, causing the Control Plane API (`apps/api`) to crash immediately on startup with `ERR_MODULE_NOT_FOUND: Cannot find package 'pg'` and fail strict TypeScript checks (28 errors).
2. **Unmigrated PostgreSQL Database:** PostgreSQL 16 and Redis 7 are running and healthy in Docker, but database schema DDL migrations (`apps/api/drizzle/0000_glamorous_maginty.sql`) have never been executed. The database contains 0 tables.
3. **Missing API-to-Gateway Wiring:** The Control Plane API records running deployments but contains zero integration code calling Teammate 4's Gateway service (`deploy/gateway/gateway.mjs`). As a result, Caddy reverse proxy rules and Cloudflare Quick Tunnels are never provisioned dynamically when a container starts.
4. **Admin Authentication Token Mismatch:** The frontend defaults to `VITE_ADMIN_TOKEN = 'cwc-admin-token-super-secret-dev'`, whereas the API defaults to `ADMIN_TOKEN = 'dev-admin-token-change-in-production'`. Mutating API requests from the web UI are rejected with HTTP 401 UNAUTHORIZED, causing the frontend to silently fall back to client-side `localStorage` mock simulation.

### Subsystem Readiness Breakdown:

- **Distributed Worker Agent (`apps/worker`):** **100% Ready & Verified.** Typecheck (0 errors), lint (0 errors), build (85ms), and 6/6 automated live Docker test cases passed.
- **Frontend Dashboard (`apps/web`):** **90% Implemented / Verified in Isolation.** UI builds cleanly (`vite build` in 7.65s) and lints cleanly. However, it transparently operates in an offline mock/localStorage fallback mode because the API is currently unreachable/unauthorized.
- **Control Plane API (`apps/api`):** **75% Implemented / Blocked at Runtime.** Excellent architecture (Phase 4 CRUD, Phase 5 sweeper, Phase 6 scheduler placement). Blocked from execution by missing installed dependencies and empty database schema.
- **Gateway & Networking (`deploy/gateway`):** **80% Implemented / Standalone.** Gateway microservice tested and passes unit tests (`gateway.test.mjs`), but uncalled by the Control Plane API.

---

## 2. Repository State & Reviewed Commits

### 2.1 Git Topology & Commit History

The repository is on branch `main` with a clean working tree. The last 15 integrated commits reflect contributions across all 4 team members:

| Commit    | Author          | Scope    | Commit Message / Description                                                                |
| :-------- | :-------------- | :------- | :------------------------------------------------------------------------------------------ |
| `809e68c` | Hike-12         | Worker   | `docs(worker): add final technical report for worker agent and runtime`                     |
| `b6d9b7e` | code-runner1306 | Docs     | `docs: add agent workflow guidance`                                                         |
| `6377fdc` | Hike-12         | Worker   | `docs(worker): add comprehensive worker documentation and test script alias`                |
| `571acc7` | code-runner1306 | Gateway  | `fix(gateway): start correctly and authorize Caddy requests`                                |
| `48eb94b` | Reniyas717      | Frontend | Merge remote-tracking branch `main`                                                         |
| `0c9f908` | Reniyas717      | Frontend | `deployment modal have to do more`                                                          |
| `837f0f0` | rohanbagel      | API      | Merge remote-tracking branch `main`                                                         |
| `5221df5` | rohanbagel      | API      | `feat(api): implement Phase 6 resource-aware least-loaded scheduler placement engine`       |
| `bff398e` | Reniyas717      | Frontend | `settings page updated`                                                                     |
| `51657e1` | Reniyas717      | Frontend | Merge remote-tracking branch `main`                                                         |
| `5f4b585` | Reniyas717      | Frontend | `theme and few main pages done`                                                             |
| `02d47b5` | rohanbagel      | API      | Merge remote-tracking branch `main`                                                         |
| `93e215e` | rohanbagel      | API      | `feat(api): implement Phase 5 heartbeat sweeper and worker failure recovery engine`         |
| `7d174f8` | code-runner1306 | Pipeline | `Merge automatic app gateway`                                                               |
| `9c61d0d` | rohanbagel      | API      | `feat(api): implement Phase 4 deployment CRUD, task polling, and internal result reporting` |

---

## 3. Architecture & Component Ownership

```
                       +------------------------------------------------+
                       |           TEAMMATE 1: FRONTEND DASHBOARD       |
                       |       (apps/web: React 18, Vite, Tailwind v4)  |
                       +------------------------------------------------+
                                              │
                      POST /deployments (401) │ (Fails over to LocalStorage simulation)
                                              ▼
+-----------------------------------------------------------------------------------------------+
|                               TEAMMATE 2: CONTROL PLANE API                                   |
|                        (apps/api: Express, Drizzle ORM, PostgreSQL, Redis)                    |
|                                                                                               |
|  [Scheduler Engine]          [Heartbeat Sweeper]          [Task Poller Endpoint]              |
|  - Formula S(W)              - 30s timeout sweep          - GET /api/v1/workers/:id/tasks     |
|  - 4 eligibility filters     - Auto-reschedule (<= 3)     - Locks queued task to worker       |
|                                                                                               |
|  * Blockers: Node modules missing (pg, drizzle-orm, ioredis), Database unmigrated (0 tables)   |
+-----------------------------------------------------------------------------------------------+
           ▲                                  │                                  │
           │ Heartbeat (10s)                  │ Poll (3s)                        │ [MISSING CALL]
           │ POST /workers/heartbeat          │ GET /workers/:id/tasks           │ POST /v1/routes/:id
           │                                  ▼                                  ▼
+---------------------------------------------------+          +--------------------------------+
|       TEAMMATE 3: WORKER AGENT & RUNTIME          |          |  TEAMMATE 4: GATEWAY & INGRESS |
|    (apps/worker: Node.js, Docker CLI, Sandboxing) |          | (deploy/gateway: Caddy, Tunnel)|
|                                                   |          |                                |
| - Reconciles orphan containers on boot            |          | - Caddy admin API (127.0.0.1)  |
| - Shallow Git clone with traversal rejection      |          | - Cloudflare Quick Tunnel      |
| - Docker build with isolated context              |          | - Route management & health    |
| - Hard cgroup caps (512MB RAM, 1.0 CPU, 256 PIDs) |          |                                |
| - Dynamic ephemeral port allocation (-p 0:port)   |          | * Blocker: Never invoked by    |
| - HTTP 200 health probe verification              |          |   Control Plane API            |
| - Bounded log ring buffers (500 lines)            |          +--------------------------------+
+---------------------------------------------------+
```

### Team Workstream Matrix:

1. **Teammate 1 (Reniyas717):** Frontend / Dashboard (`apps/web`). Responsible for application registration forms, log streaming viewer, deployment controls, and cluster health monitoring.
2. **Teammate 2 (rohanbagel):** Control Plane API & Scheduler (`apps/api`). Responsible for Express routes, authentication middleware, PostgreSQL/Redis schemas, worker task dispatch, sweeper failure recovery, and least-loaded scheduler placement.
3. **Teammate 3 (Hike-12 / Worker):** Distributed Worker Agent (`apps/worker`). Responsible for host telemetry metrics, polling tasks, Git cloning, Docker build/run lifecycle with resource limits, ephemeral port discovery, health verification, and clean shutdown.
4. **Teammate 4 (code-runner1306):** Ingress Gateway & Deployment Pipeline (`deploy/`, `deploy/gateway`). Responsible for Caddy reverse proxy administration, Cloudflare Quick Tunnel provisioning, and Tailscale mesh orchestration.

---

## 4. Requirement-by-Requirement Status Table

| Area / Feature                           | Requirement Description                                                                          | Implementation Status                   | Evidence / Files                                                                                                                                                                                                                             |
| :--------------------------------------- | :----------------------------------------------------------------------------------------------- | :-------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shared Contracts**                     | Canonical Zod schemas and TypeScript interfaces for workers, deployments, app config, and health | **Implemented and verified**            | [`packages/shared/src/`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/packages/shared/src); `pnpm --filter @cloud-without-clouds/shared build` compiles CJS/ESM/DTS cleanly.                                                      |
| **Worker Metrics**                       | Measure CPU usage percent, total/used/free RAM, and container count without platform drift       | **Implemented and verified**            | [`apps/worker/src/services/metrics.ts`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker/src/services/metrics.ts); CPU tick deltas sample user/sys/idle time accurately on Windows & Linux.                               |
| **Worker Registration**                  | Worker sends hardware profile and auth token on startup; retries on failure                      | **Implemented and verified**            | [`apps/worker/src/index.ts`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker/src/index.ts#L80-L118); `attemptRegistration()` retries in subsequent heartbeat cycles.                                                     |
| **Worker Heartbeats**                    | Periodic telemetry dispatched every 10s non-overlapping                                          | **Implemented and verified**            | [`apps/worker/src/index.ts`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker/src/index.ts#L123-L174); uses `isHeartbeatRunning` lock guard.                                                                              |
| **Worker Task Poller**                   | Polls `GET /tasks` every 3s and executes asynchronously without blocking the loop                | **Implemented and verified**            | [`apps/worker/src/services/task-poller.ts`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker/src/services/task-poller.ts).                                                                                                |
| **Worker Git Sandboxing**                | Clones public Git repositories into temp directory; rejects path traversal and flag injection    | **Implemented and verified**            | [`apps/worker/src/services/git-runner.ts`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker/src/services/git-runner.ts); Tests 3, 5, and 6 verified.                                                                      |
| **Worker Docker Engine**                 | Builds Docker images and runs containers with hard kernel resource limits                        | **Implemented and verified**            | [`apps/worker/src/services/docker-engine.ts`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker/src/services/docker-engine.ts); Enforces `--memory=512m`, `--cpus=1.0`, `--pids-limit=256`. Verified via `docker inspect`. |
| **Worker Port Allocation**               | Dynamic ephemeral host port binding (`-p 0:<targetPort>`) to prevent port collisions             | **Implemented and verified**            | [`apps/worker/src/services/docker-engine.ts`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker/src/services/docker-engine.ts#L210); resolved dynamically via `docker inspect`.                                            |
| **Worker Health Check**                  | Probes container HTTP endpoint (`/`) up to 10 attempts before declaring ready                    | **Implemented and verified**            | [`apps/worker/src/services/docker-engine.ts`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker/src/services/docker-engine.ts#L365); Test 1 verified HTTP 200.                                                             |
| **Worker Teardown & Reconcile**          | Cleans up containers on stop/cancel; purges orphan containers on restart                         | **Implemented and verified**            | [`apps/worker/src/services/deployment-runner.ts`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/worker/src/services/deployment-runner.ts); `reconcileExistingContainers()` cleans orphan containers.                          |
| **API Task Polling Endpoint**            | `GET /api/v1/workers/:id/tasks` locks oldest queued task and returns task payload                | **Implemented but unverified**          | [`apps/api/src/routes/workers.ts`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/api/src/routes/workers.ts#L424); Code written, blocked by uninstalled `pg`/`drizzle-orm` at runtime.                                         |
| **API Worker Registration & Heartbeats** | Stores worker profile in PostgreSQL, updates heartbeat timestamp, caches lease in Redis          | **Implemented but unverified**          | [`apps/api/src/routes/workers.ts`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/api/src/routes/workers.ts#L176-L368); Code written, blocked by runtime dependency failure.                                                   |
| **API Deployment Creation**              | `POST /api/v1/deployments` creates app record, invokes scheduler, queues deployment              | **Implemented but unverified**          | [`apps/api/src/routes/deployments.ts`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/api/src/routes/deployments.ts#L102); Code written, blocked by runtime dependency failure.                                                |
| **API Scheduler Placement**              | Least-loaded placement engine using formula $S(W)$ with 4 eligibility filters                    | **Implemented but unverified**          | [`apps/api/src/services/scheduler.ts`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/api/src/services/scheduler.ts); Unit logic complete, blocked by unmigrated database.                                                     |
| **API Sweeper & Recovery**               | Detects dead workers (>30s), marks offline, reschedules deployments up to 3 retries              | **Implemented but unverified**          | [`apps/api/src/services/sweeper.ts`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/api/src/services/sweeper.ts); Sweeper loop instantiated in `apps/api/src/index.ts`.                                                        |
| **Database Migrations**                  | Drizzle schema definitions and migration script to set up PostgreSQL tables                      | **Partially implemented**               | Migration SQL file exists in `apps/api/drizzle/`, but has never been applied to running PostgreSQL instance (`\dt` is empty).                                                                                                                |
| **Frontend UI Dashboard**                | Dashboard, Applications, Deployments, Workers, and Settings pages with shadcn styling            | **Implemented and verified**            | [`apps/web/src/pages/`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/web/src/pages); All 5 pages implemented; builds in 7.65s.                                                                                               |
| **Frontend API Integration**             | Web client communicates with backend API over HTTP/JSON with Bearer auth                         | **Partially implemented**               | [`apps/web/src/services/api.ts`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/apps/web/src/services/api.ts); Blocked by `ADMIN_TOKEN` mismatch and silently falls back to localStorage simulation.                                |
| **Gateway Routing Service**              | Caddy REST API update and Cloudflare Quick Tunnel publishing service                             | **Implemented and verified (Isolated)** | [`deploy/gateway/gateway.mjs`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/deploy/gateway/gateway.mjs); `node deploy/gateway/gateway.test.mjs` passed.                                                                           |
| **End-to-End Routing Link**              | Control Plane calls Gateway upon container readiness to publish public URL                       | **Missing**                             | `apps/api` has no HTTP client or route calling `deploy/gateway/gateway.mjs`.                                                                                                                                                                 |
| **Git-to-Image Publishing CLI**          | Standalone script building and pushing images to Docker Hub                                      | **Partially implemented**               | [`deploy/build-and-publish.sh`](file:///c:/Users/Lenovo/Desktop/Aliqyaan%20Coding/BNB26/deploy/build-and-publish.sh); Exists as standalone CLI; unintegrated with API/Worker.                                                                |

---

## 5. Verification Commands and Actual Observed Results

| Target Package / Check            | Command Executed                                                                | Result / Output                                                                                                              | Audit Finding                                                                                                                                                                                                                        |
| :-------------------------------- | :------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Monorepo Frozen Install**       | `pnpm install --frozen-lockfile`                                                | **FAILED (Exit 1)**<br>`ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY: Broken lockfile: no entry for 'tsup@8.5.1...'`                 | Lockfile merge conflict was committed without resolution.                                                                                                                                                                            |
| **Monorepo Typecheck**            | `pnpm check-types`                                                              | **FAILED (Exit 2)**<br>Failed in `apps/api`: 28 errors (`Cannot find module 'pg'`, `Cannot find module 'drizzle-orm'`, etc.) | Shared, Web, and Worker passed; API failed due to missing installed packages.                                                                                                                                                        |
| **Worker Typecheck**              | `pnpm --filter @cloud-without-clouds/worker check-types`                        | **PASSED (Exit 0)**<br>`tsc --noEmit` clean                                                                                  | Worker code is strictly typed.                                                                                                                                                                                                       |
| **Worker Lint**                   | `pnpm --filter @cloud-without-clouds/worker lint`                               | **PASSED (Exit 0)**<br>`eslint src` clean                                                                                    | 0 warnings, 0 errors.                                                                                                                                                                                                                |
| **Worker Production Build**       | `pnpm --filter @cloud-without-clouds/worker build`                              | **PASSED (Exit 0)**<br>`tsup` compiled `dist/index.js` (47.99 KB) in 85ms                                                    | Worker compiles cleanly to ESM.                                                                                                                                                                                                      |
| **Worker Runtime & Docker Suite** | `pnpm --filter @cloud-without-clouds/worker test`                               | **PASSED (Exit 0)**<br>All 6 tests passed against live Docker daemon 28.3.2                                                  | Real Git clone, Docker build, kernel limit verification (512MB RAM, 1 CPU, 256 PIDs), health check 200 OK, path traversal defense, missing Dockerfile handling, flag injection defense, and non-existent repo handling all verified. |
| **Frontend Production Build**     | `pnpm --filter @cloud-without-clouds/web build`                                 | **PASSED (Exit 0)**<br>`vite build` in 7.65s (`dist/assets/index-BccaBR7k.js` 331 KB)                                        | Frontend bundle generated without compilation errors.                                                                                                                                                                                |
| **Frontend Lint**                 | `pnpm --filter @cloud-without-clouds/web lint`                                  | **PASSED (Exit 0)**<br>`eslint src` clean                                                                                    | 0 warnings, 0 errors.                                                                                                                                                                                                                |
| **API Lint**                      | `pnpm --filter @cloud-without-clouds/api lint`                                  | **PASSED (Exit 0)**<br>`eslint src` clean                                                                                    | 0 warnings, 0 errors.                                                                                                                                                                                                                |
| **API Runtime Startup**           | `node apps/api/dist/index.js`                                                   | **FAILED (Exit 1)**<br>`Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'pg'`                                              | API cannot start up until packages are installed.                                                                                                                                                                                    |
| **PostgreSQL Migration Check**    | `docker exec -i cwc-postgres psql -U cwc_user -d cloud_without_clouds -c "\dt"` | **OBSERVED**<br>`Did not find any relations.`                                                                                | Database tables do not exist in PostgreSQL.                                                                                                                                                                                          |
| **Gateway Service Tests**         | `node deploy/gateway/gateway.test.mjs`                                          | **PASSED (Exit 0)**<br>`ok - gateway publication API authenticates, validates, probes, publishes and removes routes`         | Gateway logic verified in isolation.                                                                                                                                                                                                 |

---

## 6. Integration Issues & Risks (Prioritized by Severity)

### 🔴 CRITICAL SEVERITY

#### 1. Broken Lockfile & Missing API Dependencies

- **Evidence:** `pnpm install --frozen-lockfile` fails with `ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY`. Starting `apps/api` throws `ERR_MODULE_NOT_FOUND: Cannot find package 'pg'`.
- **Root Cause:** Commits adding Drizzle, PostgreSQL, and Redis to `apps/api/package.json` (`4559938`, `837f0f0`) were merged with conflicting lockfile resolutions.
- **Impact:** The backend API server cannot start up at all.
- **Owner / Remediation:** Teammate 2 must run `pnpm install --no-frozen-lockfile` from the repository root to regenerate `pnpm-lock.yaml`, then verify `pnpm --filter @cloud-without-clouds/api check-types`.

#### 2. PostgreSQL Database Tables Not Created

- **Evidence:** Running `docker exec -i cwc-postgres psql -U cwc_user -d cloud_without_clouds -c "\dt"` returns `Did not find any relations.`
- **Root Cause:** Drizzle migration `apps/api/drizzle/0000_glamorous_maginty.sql` has not been applied to the PostgreSQL container.
- **Impact:** Once the API dependencies are installed, any request to `/api/v1/deployments`, `/api/v1/workers/register`, or `/api/v1/workers/:id/tasks` will immediately crash with PostgreSQL error `relation "applications" does not exist`.
- **Owner / Remediation:** Teammate 2 must run `pnpm --filter @cloud-without-clouds/api db:migrate` or `pnpm --filter @cloud-without-clouds/api db:push` to apply the DDL schema to the live database.

#### 3. Complete Disconnect Between Control Plane API and Ingress Gateway

- **Evidence:** Zero occurrences of `gateway`, port `2019`, or route publishing calls in `apps/api/src/**/*.ts`.
- **Root Cause:** Teammate 2 and Teammate 4 developed their components independently without wiring the handoff.
- **Impact:** When a worker launches a container and reports its assigned port, the API records it in the database, but never contacts `deploy/gateway/gateway.mjs`. Caddy is never updated, no Cloudflare Quick Tunnel is generated, and the platform-generated public URL is never populated.
- **Owner / Remediation:** Teammate 2 and Teammate 4 must add an HTTP client call in `apps/api/src/routes/internal-deployments.ts` calling `POST http://<gateway-host>:<gateway-port>/v1/routes/:deploymentId` when a deployment reaches state `running`.

---

### 🟠 HIGH SEVERITY

#### 4. Frontend-to-Backend Admin Token Mismatch

- **Evidence:**
  - `apps/web/src/services/api.ts` line 9: `ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || 'cwc-admin-token-super-secret-dev'`
  - `apps/api/src/config/env.ts` line 25: `ADMIN_TOKEN = ...default('dev-admin-token-change-in-production')`
  - `.env.example`: Neither `ADMIN_TOKEN` nor `VITE_ADMIN_TOKEN` is declared in `.env.example`.
- **Impact:** Any deployment submission from the frontend is rejected by the API with HTTP 401 UNAUTHORIZED.
- **Owner / Remediation:** Teammate 1 and Teammate 2 must standardize the token across `.env.example`, `apps/api`, and `apps/web` (e.g. `ADMIN_TOKEN=dev-admin-token-change-in-production` and `VITE_ADMIN_TOKEN=dev-admin-token-change-in-production`).

#### 5. Frontend Silent Fallback Masks Real Backend State

- **Evidence:** In `apps/web/src/services/api.ts` (`createApplication`), failed network calls to `/api/v1/deployments` catch errors silently and write synthetic mock deployments into `localStorage` with random IDs and fake `trycloudflare.com` URLs.
- **Impact:** Evaluators using the web UI might believe a real container was deployed when in reality only a local browser `localStorage` record was created, and no Docker container was ever launched.
- **Owner / Remediation:** Teammate 1 should surface a visible error toast/banner when the API call fails rather than silently generating mock state.

---

### 🟡 MEDIUM SEVERITY

#### 6. Disconnected `build-and-publish.sh` Pipeline Script

- **Evidence:** `deploy/build-and-publish.sh` builds images and pushes them to Docker Hub. Neither `apps/worker` nor `apps/api` calls this script.
- **Impact:** Redundant architectural path. The worker already performs local Git shallow clones and Docker builds without requiring Docker Hub accounts or pushing bandwidth.
- **Owner / Remediation:** Clarify in the team documentation that `build-and-publish.sh` is an auxiliary standalone CLI tool, while the primary hackathon MVP path uses the worker agent's direct Git-to-Docker runtime.

#### 7. Missing Dynamic Host IP in Worker Registration

- **Evidence:** `apps/worker/src/index.ts` reports hostname and port during registration, but `apps/api/src/routes/workers.ts` sets `ipAddress: req.ip || '127.0.0.1'` instead of resolving the worker's Tailscale mesh IP (`100.x.y.z`).
- **Impact:** In a multi-machine mesh setup, the Control Plane and Gateway will attempt to connect to `127.0.0.1` instead of the worker's Tailscale IP address.
- **Owner / Remediation:** Worker should inspect its Tailscale network interface (`tailscale ip -4` or network interface addresses starting with `100.`) and include its Tailscale IP in `WorkerRegistrationPayload`.

---

### 🟢 LOW SEVERITY

#### 8. Missing Environment Variables in `.env.example`

- **Evidence:** `.env.example` is missing `ADMIN_TOKEN`, `VITE_ADMIN_TOKEN`, `GATEWAY_TOKEN`, and `GATEWAY_BIND_HOST`.
- **Impact:** New developers setting up from `.env.example` experience authorization failures out-of-the-box.
- **Owner / Remediation:** Update `.env.example` to include all platform tokens and defaults.

---

## 7. Missing Features & External Dependencies

1. **System Packages on Host:**
   - Gateway operation requires `caddy` and `cloudflared` installed on the host running `deploy/gateway/gateway.mjs`. Neither package is packaged inside npm.
2. **Post-Build Ingress Webhook:**
   - Control plane requires an outbound HTTP call to `deploy/gateway` upon receiving `running` status in `apps/api/src/routes/internal-deployments.ts`.
3. **Database Seed Data:**
   - `users` table requires a default administrator user (`id: 'admin'`) seeded to satisfy the foreign key constraint `applications_user_id_users_id_fk`. (Note: `apps/api/src/routes/deployments.ts` implements `ensureDefaultAdminUser()`, which auto-inserts this user on the first deployment).

---

## 8. Recommended Next Steps (Ordered by Priority)

To achieve a working end-to-end hackathon demonstration, the team must execute the following actions in strict order:

### Priority 1: Unblock Monorepo & API Startup (Teammate 2)

1. Run `pnpm install --no-frozen-lockfile` to repair `pnpm-lock.yaml` and install `pg`, `drizzle-orm`, and `ioredis`.
2. Apply database migrations to PostgreSQL:
   ```bash
   pnpm --filter @cloud-without-clouds/api db:migrate
   ```
3. Verify that `pnpm check-types` passes with exit code 0 across all 4 packages.

### Priority 2: Align Authentication & Environment Variables (Teammate 1 & Teammate 2)

1. Add `ADMIN_TOKEN=cwc-admin-token-super-secret-dev` and `VITE_ADMIN_TOKEN=cwc-admin-token-super-secret-dev` to root `.env` and `.env.example`.
2. Start the API server (`pnpm dev:api`) and run `node apps/api/test-auth.js` to verify all route authorization passes.

### Priority 3: Wire API to Gateway Route Publishing (Teammate 2 & Teammate 4)

1. In `apps/api/src/routes/internal-deployments.ts`, when `payload.state === 'running'`, add:
   ```typescript
   if (process.env.GATEWAY_URL) {
     await fetch(`${process.env.GATEWAY_URL}/v1/routes/${id}`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         Authorization: `Bearer ${process.env.GATEWAY_TOKEN}`,
       },
       body: JSON.stringify({
         upstreamIp: worker.ipAddress,
         assignedPort: payload.assignedPort,
         healthPath: '/',
       }),
     });
   }
   ```
2. Save the returned `publicUrl` in PostgreSQL `deployments.public_url`.

### Priority 4: Disable Frontend LocalStorage Mocking in Demo Mode (Teammate 1)

1. In `apps/web/src/services/api.ts`, remove the automatic mock deployment generation in `createApplication()`.
2. Display an error banner if the API request fails so real integration issues are transparent.

---

## 9. Demo Readiness Assessment & Verification Checklist

### Current Demo Feasibility:

- **Direct Worker Runtime Demo:** **100% Ready.** Can demonstrate live cloning, Docker building, resource caps enforcement, and HTTP serving on `localhost:<assignedPort>`.
- **Integrated Full-Stack Demo:** **Requires executing Priorities 1 & 2 above (~15 minutes of work).** Once dependencies are installed and the database is migrated, the API, Worker, and Frontend can execute the full lifecycle.

### End-to-End Demo Checklist:

- [ ] 1. Start local backing infrastructure: `pnpm infra:up` (verify Postgres & Redis are healthy).
- [ ] 2. Repair lockfile and install packages: `pnpm install --no-frozen-lockfile`.
- [ ] 3. Apply database migrations: `pnpm --filter @cloud-without-clouds/api db:migrate`.
- [ ] 4. Verify TypeScript compilation: `pnpm check-types` (all 4 packages must exit 0).
- [ ] 5. Start Control Plane API: `pnpm dev:api` (verify listening on port 4000).
- [ ] 6. Start Worker Agent: `pnpm dev:worker` (verify registration and heartbeats in API console).
- [ ] 7. Start Frontend Dashboard: `pnpm dev:web` (open `http://localhost:5173`).
- [ ] 8. Submit deployment in Dashboard:
  - Repository URL: `https://github.com/paulbouwer/hello-kubernetes.git`
  - Branch: `main`
  - Target Port: `8080`
  - RAM Limit: `512` MB
- [ ] 9. Observe Worker logs in terminal: Git clone $\to$ Docker build $\to$ Container launch with memory cap $\to$ Health check 200 OK.
- [ ] 10. Open deployed application at `http://localhost:<assignedPort>`.
