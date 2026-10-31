# Changes & Implementation Log: Phase 1 — Database Foundation

## 1. Overview & Objectives

In **Phase 1 (Database Foundation)**, we established the persistence layer for the **Cloud Without Clouds** control plane (`apps/api`) using **Drizzle ORM** on top of **PostgreSQL 16**. This adheres strictly to the architectural specifications defined in `ARCHITECTURE.md` and `AGENTS.md`.

---

## 2. Dependencies & Tooling Installed

The following packages were installed in `apps/api`:
- **`drizzle-orm` (^0.45.4)**: TypeScript-native, zero-binary-overhead ORM and query builder.
- **`drizzle-kit` (^0.31.11)** (devDependencies): Migration generator and schema introspection CLI.
- **`pg` (^8.23.1) & `@types/pg` (^8.23.1)**: Production-grade PostgreSQL client driver and type definitions.
- **`drizzle-zod` (^0.8.3)**: Automatic derivation of Zod validation schemas directly from Drizzle table definitions to maintain single-source-of-truth integrity.

---

## 3. Database Schema (`apps/api/src/db/schema.ts`)

Defined 6 core relational tables and PostgreSQL enum types conforming to domain contracts:

### Enums
- **`worker_state`**: `'idle'`, `'busy'`, `'draining'`, `'offline'`, `'error'`
- **`deployment_state`**: `'pending'`, `'queued'`, `'building'`, `'deploying'`, `'running'`, `'failed'`, `'stopped'`, `'cancelled'`
- **`app_framework`**: `'nodejs'`, `'python'`, `'static'`, `'dockerfile'`, `'go'`
- **`log_stream`**: `'stdout'`, `'stderr'`, `'system'`
- **`log_level`**: `'info'`, `'warn'`, `'error'`, `'debug'`

### Tables
1. **`users`**:
   - `id` (PK, varchar(128))
   - `email` (varchar(255), unique)
   - `name` (varchar(255))
   - `created_at` (timestamptz)
2. **`worker_nodes`**:
   - Tracks developer laptop nodes connected over Tailscale.
   - Includes host specifications: CPU cores, RAM (total/used/free), CPU usage %, max concurrent workloads, active container count.
   - Network properties: Tailscale IP (`ip_address`), port (default 5001), version.
   - Heartbeat tracking: `registered_at`, `last_heartbeat_at`.
3. **`applications`**:
   - Defines application identity and Git source.
   - Includes: `slug` (unique), `framework`, `repository_url`, `git_branch`, `root_directory`, `target_port`, `env_vars` (jsonb array), and default resource limits (`cpu_limit_cores`, `memory_limit_mb`).
   - Foreign key to `users.id` with `cascade` delete.
4. **`deployments`**:
   - Tracks execution lifecycles of deployed revisions.
   - Links `application_id` (FK to `applications.id`, cascade) and `worker_id` (FK to `worker_nodes.id`, set null on deletion).
   - Tracks runtime data: `container_id`, `assigned_port` (dynamic host port), `public_url`, `error_message`, `retry_count`, `started_at`, `finished_at`.
5. **`deployment_logs`**:
   - High-throughput append-only log sink for build and container output.
   - Indexed FK to `deployments.id` (cascade).
6. **`deployment_events`**:
   - Discrete state change audit events (`SCHEDULED`, `BUILD_START`, `CONTAINER_START`, `FAILED`, etc.).

### Relations & Zod Integration
- Set up Drizzle relations between `users`, `applications`, `deployments`, `worker_nodes`, `logs`, and `events`.
- Generated insert/select Zod schemas (`insertWorkerNodeSchema`, `selectDeploymentSchema`, etc.) via `drizzle-zod`.

---

## 4. Connection Pool & Health Check (`apps/api/src/db/index.ts`)

- Configured a persistent `pg.Pool` connection pool with:
  - Connection URL driven by `env.DATABASE_URL`.
  - Max 10 concurrent pool connections.
  - 30s idle timeout and 5s connection timeout.
- Exported typed Drizzle client instance `db = drizzle(pool, { schema })`.
- Implemented `checkDatabaseConnection()` function that runs a lightweight `SELECT 1` ping and measures round-trip latency in milliseconds.
- Connected database health status dynamically into Express route `GET /health` (`apps/api/src/routes/health.ts`).

---

## 5. Migration Pipeline & Scripts

1. **Configuration (`apps/api/drizzle.config.ts`)**:
   - Configured dialect `postgresql`, schema entry `./src/db/schema.ts`, and target migration folder `./drizzle`.
2. **Generated Migration**:
   - `apps/api/drizzle/0000_glamorous_maginty.sql` containing full DDL statements, enum types, table definitions, unique constraints, and foreign key constraints.
3. **Migration Runner (`apps/api/src/db/migrate.ts`)**:
   - Programmatic execution via Drizzle's `migrate()` helper.
4. **NPM / Workspace Scripts**:
   - `pnpm db:generate`: Runs `drizzle-kit generate` to produce SQL diffs.
   - `pnpm db:push`: Pushes schema changes directly without generating migrations (prototyping).
   - `pnpm db:migrate`: Executes pending SQL migrations against the active database.

---

## 6. Pre-requisite & Environment Fixes Resolved

During Phase 1 setup and testing, the following host and cross-platform issues were resolved:
1. **Shell Script Line Endings (`deploy/setup-tailscale.sh`)**:
   - Converted CRLF line endings to Unix LF.
   - Added `.gitattributes` (`*.sh text eol=lf`) to enforce LF on Windows Git checkouts.
   - Added `deploy/setup-tailscale.ps1` for native Windows PowerShell environments.
2. **Docker WSL 2 Integration**:
   - Enabled WSL 2 integration in Docker Desktop to ensure container networking between Windows host and Linux subsystem.
3. **Port 5432 Conflict**:
   - Detected and stopped a pre-existing local Windows PostgreSQL 17 background service (`postgresql-x64-17`) occupying port 5432, allowing the Docker Compose PostgreSQL 16 container (`cwc-postgres`) to bind to 5432 without collision.

---

## 7. Verification & Quality Assurance

- **Type Checking**: Passed `pnpm check-types` across all 4 monorepo packages (`shared`, `api`, `web`, `worker`) with 0 errors.
- **Linting**: Passed `pnpm lint` across the monorepo with 0 ESLint errors.
- **Build**: Successfully compiled using `pnpm build` across all packages.
- **Database Status**:
  - `docker compose ps` shows `cwc-postgres` and `cwc-redis` in `healthy` state.
  - Executed `pnpm db:migrate` successfully creating all 6 tables.
  - Verified `GET /health` returning `"status": "ok"` with `"database": { "status": "ok", "message": "PostgreSQL connected" }`.


---

# Changes & Implementation Log: Phase 2 — Auth Middleware & Environment Validation

## 1. Overview & Objectives

In **Phase 2**, we implemented endpoint protection and secret management for the Control Plane API (`apps/api`) in strict alignment with Section 4.1 of `AGENTS.md` and Section 13.1 of `ARCHITECTURE.md`.

---

## 2. Environment Schema Updates (`apps/api/src/config/env.ts`)

Added strict validation for two pre-shared bearer tokens via Zod:
- **`ADMIN_TOKEN`**: Shared secret required for user/admin mutating operations (e.g. creating/cancelling deployments). Defaulted to `dev-admin-token-change-in-production` for frictionless local development.
- **`WORKER_SECRET_TOKEN`**: Shared secret required for worker-to-control-plane communication (e.g. registration, heartbeat, task polling, container status reporting). Defaulted to `dev-worker-secret-token-change-in-production`.

---

## 3. Auth Middlewares (`apps/api/src/middlewares/auth.ts`)

Created three reusable Express middlewares:
1. **`requireAdmin`**:
   - Inspects `Authorization: Bearer <ADMIN_TOKEN>` header.
   - If invalid or missing, immediately halts the request and returns a structured `401 Unauthorized` response with code `UNAUTHORIZED`.
   - On success, attaches default admin identity (`req.user = { id: 'admin', role: 'admin' }`) and calls `next()`.
2. **`requireWorker`**:
   - Inspects `Authorization: Bearer <WORKER_SECRET_TOKEN>` header.
   - Rejects unauthorized callers with `401 Unauthorized`.
   - Used to guard worker node operational endpoints.
3. **`optionalAdmin`**:
   - Permissive in `development` and `test` environments to allow unauthenticated read-only inspection (e.g. listing deployments and worker nodes).
   - If a token is provided in development, verifies validity.
   - In `production`, strictly requires authorization.

---

## 4. Protected Routes Integration

Updated route handlers to apply auth guards:
- **`apps/api/src/routes/workers.ts`**:
  - `POST /register`: Guarded by `requireWorker`.
  - `POST /heartbeat`: Guarded by `requireWorker`.
  - `POST /status`: Guarded by `requireWorker`.
  - `GET /:id/tasks`: Guarded by `requireWorker`.
  - `GET /`: Guarded by `optionalAdmin`.
- **`apps/api/src/routes/deployments.ts`**:
  - `POST /`: Guarded by `requireAdmin`.
  - `POST /:id/cancel`: Guarded by `requireAdmin`.
  - `GET /`, `GET /:id`, `GET /:id/logs`: Guarded by `optionalAdmin`.
- **`apps/api/src/routes/health.ts`**:
  - Remains public and unauthenticated (`GET /health`).

---

## 5. Verification & Quality Assurance

- **Type Checking**: Passed `pnpm check-types` across all packages with 0 errors.
- **Linting**: Passed `pnpm lint` across the monorepo with 0 ESLint errors.
- **Build**: Successfully compiled using `pnpm --filter @cloud-without-clouds/api build`.

- **Manual Verification Steps & Results**:
  - `POST /api/v1/deployments` without token returns `401 Unauthorized` with structured JSON:
    ```json
    { "success": false, "error": { "code": "UNAUTHORIZED", "message": "Valid admin authorization token required" } }
    ```
  - `POST /api/v1/deployments` with `Authorization: Bearer dev-admin-token-change-in-production` passes auth check.
  - `POST /api/v1/workers/register` without token returns `401 Unauthorized`:
    ```json
    { "success": false, "error": { "code": "UNAUTHORIZED", "message": "Valid worker secret authorization token required" } }
    ```
  - `POST /api/v1/workers/register` with `Authorization: Bearer dev-worker-secret-token-change-in-production` passes auth check.
- **Git Synchronization**: Merged remote worker and deploy updates and pushed to `main`.


---

# Changes & Implementation Log: Phase 3 — Worker Registration & Heartbeat API

## 1. Overview & Objectives

In **Phase 3**, we implemented the full worker lifecycle communication engine on the Control Plane API (`apps/api`):
- Redis connection management for ephemeral worker heartbeat leases (35s TTL).
- Worker node registration with hardware telemetry and capability quotas.
- Periodic heartbeat telemetry receiver updating both PostgreSQL and Redis cache.
- Worker status state transitions (e.g. graceful shutdown and draining).
- Worker listing and detail endpoints conforming to shared contracts.

---

## 2. Dependencies & Tooling

Installed in `apps/api`:
- **`ioredis` (^5.4.2)**: High-performance Redis client for Node.js.
- **`@types/ioredis`**: Type definitions for Redis operations.

---

## 3. Redis Heartbeat Leases (`apps/api/src/cache/redis.ts`)

- Configured singleton Redis client connecting via `env.REDIS_HOST`, `env.REDIS_PORT`, and `env.REDIS_PASSWORD`.
- Added helper functions:
  - `checkRedisConnection()`: Ping verification measuring roundtrip latency in ms.
  - `recordWorkerHeartbeatInCache(workerId, timestamp)`: Sets `worker:last_seen:<id>` with a 35-second TTL (`EX 35`).
  - `getWorkerLastSeenFromCache(workerId)`: Fetches lease timestamp.
  - `removeWorkerFromCache(workerId)`: Evicts lease on node drain/shutdown.
  - `getActiveWorkerIdsFromCache()`: Lists all non-expired worker IDs.
- Connected Redis health monitoring dynamically to `GET /health` (`apps/api/src/routes/health.ts`).

---

## 4. Worker Routes Implementation (`apps/api/src/routes/workers.ts`)

Implemented and verified the following endpoints:

1. **`POST /api/v1/workers/register`** (`requireWorker`):
   - Validates payload against `WorkerRegistrationSchema`.
   - Derives client IP address (from headers/socket).
   - Upserts into PostgreSQL `worker_nodes` table with state `'idle'`.
   - Records 35s active lease in Redis.
   - Returns `WorkerStatusResponse` with `acknowledged: true` and the registered `WorkerNode`.
2. **`POST /api/v1/workers/heartbeat`** (`requireWorker`):
   - Validates payload against `WorkerHeartbeatSchema`.
   - Verifies worker registration exists in PostgreSQL (returns 404 if unregistered).
   - Updates `cpuUsagePercent`, `freeMemoryMb`, `usedMemoryMb`, `activeContainers`, `state`, and `lastHeartbeatAt`.
   - Refreshes 35s lease in Redis (`worker:last_seen:<workerId>`).
   - Returns `200 OK` acknowledgment.
3. **`POST /api/v1/workers/status`** (`requireWorker`):
   - Accepts explicit state transitions (`idle`, `busy`, `draining`, `offline`, `error`).
   - Updates PostgreSQL `worker_nodes.state`.
   - Automatically purges the Redis heartbeat lease if state transitions to `draining` or `offline`.
4. **`GET /api/v1/workers`** (`optionalAdmin`):
   - Queries all workers from PostgreSQL `worker_nodes`.
   - Maps database rows to canonical `WorkerNode` interface.
   - Returns `{ success: true, count, data: WorkerNode[] }`.
5. **`GET /api/v1/workers/:id`** (`optionalAdmin`):
   - Fetches individual worker details by ID.
6. **`GET /api/v1/workers/:id/tasks`** (`requireWorker`):
   - Poll endpoint for deployment task dispatch (returns `hasTask: false` awaiting Phase 4 scheduler).

---

## 5. Verification & Test Suite

- **Unit/Integration Test Suite (`apps/api/test-auth.js`)**:
  - Expanded test suite to cover all auth scenarios, payload validation, and responses.
  - All 25 test cases passing (`25 passed, 0 failed`).
- **Live End-to-End Verification**:
  - Registered worker node `worker-node-redis-check`.
  - Verified persistence in PostgreSQL `worker_nodes` via `psql`.
  - Verified 35s TTL key `worker:last_seen:worker-node-redis-check` in Redis container (`cwc-redis`).
  - Tested heartbeat telemetry updates and verified state reflection.
  - Tested explicit drain status and confirmed Redis key removal.
- **Type Checking & Linting**:
  - `pnpm check-types` passed with 0 errors.
  - `pnpm lint` passed with 0 errors.
  - `pnpm --filter @cloud-without-clouds/api build` compiled successfully.


---

# Changes & Implementation Log: Phase 4 — Deployment CRUD, Task Polling & Result Reporting

## 1. Overview & Objectives

In **Phase 4**, we implemented the core orchestration lifecycle for deployments on the Control Plane API (`apps/api`):
- Deployment submission and queuing endpoint (`POST /api/v1/deployments`) with automatic application creation, slug resolution, and candidate worker assignment.
- Read-only querying endpoints for deployments and build/runtime log history (`GET /api/v1/deployments`, `GET /api/v1/deployments/:id`, `GET /api/v1/deployments/:id/logs`).
- Deployment cancellation endpoint (`POST /api/v1/deployments/:id/cancel`) for in-flight tasks.
- Pull-based task polling endpoint (`GET /api/v1/workers/:id/tasks`) enabling distributed worker nodes to fetch tasks FIFO, transition deployment state to `'building'`, and receive complete `DeploymentTaskPayload` objects.
- Internal worker feedback routes (`/api/v1/internal/deployments`) allowing worker agents to stream build logs and report container runtime results (assigned port, container ID, running/failed status).
- Event audit logging in `deployment_events` for lifecycle visibility (`SCHEDULED`, `CONTAINER_START`, `FAILED`, `CANCELLED`).

---

## 2. API Routes Implemented

### 1. Deployment Management (`apps/api/src/routes/deployments.ts`)
- **`POST /api/v1/deployments`** (`requireAdmin`):
  - Validates payload against `CreateDeploymentInputSchema` (repository URL, branch, framework, target port, env variables, CPU/memory limits).
  - Guarantees default admin user existence via `ensureDefaultAdminUser()`.
  - Reuses or creates an `applications` record with unique slug derivation.
  - Selects an eligible worker node (`idle` or `busy` with lowest active container load) if none specified.
  - Computes sequential version number for the application.
  - Creates deployment record in state `'queued'`.
  - Emits `SCHEDULED` discrete audit event in `deployment_events`.
  - Returns canonical `Deployment` model with HTTP 201 Created.
- **`GET /api/v1/deployments`** (`optionalAdmin`):
  - Lists deployments with optional `applicationId` query filtering, ordered newest first (`createdAt DESC`).
- **`GET /api/v1/deployments/:id`** (`optionalAdmin`):
  - Retrieves full deployment details or returns 404 if not found.
- **`GET /api/v1/deployments/:id/logs`** (`optionalAdmin`):
  - Streams chronological log entries for the deployment from PostgreSQL `deployment_logs`.
- **`POST /api/v1/deployments/:id/cancel`** (`requireAdmin`):
  - Cancels an active or queued deployment.
  - Rejects cancellation if already in terminal state (`stopped`, `failed`, `cancelled`).
  - Sets state to `'cancelled'`, sets `finishedAt`, and records `CANCELLED` audit event.

### 2. Worker Task Dispatch (`apps/api/src/routes/workers.ts`)
- **`GET /api/v1/workers/:id/tasks`** (`requireWorker`):
  - Pull-based FIFO scheduler matching tasks assigned directly to the worker or unassigned queued tasks.
  - Locks the selected deployment to the polling worker node and immediately advances status from `'queued'` to `'building'` to prevent double-pickup.
  - Fetches associated application configuration and constructs a complete `DeploymentTaskPayload` (`git`, `dockerfilePath`, `buildContext`, `targetPort`, `resourceLimits`, `env`).
  - Returns `{ success: true, hasTask: true, task }` or `{ success: true, hasTask: false }`.

### 3. Internal Worker Ingestion (`apps/api/src/routes/internal-deployments.ts`)
- Mounted under `/api/v1/internal/deployments` and guarded by `requireWorker`:
- **`POST /:id/result`**:
  - Validates payload with `DeploymentResultPayloadSchema`.
  - Updates deployment state (`running`, `failed`, `stopped`), records `containerId`, `assignedPort`, `publicUrl`, `errorMessage`, and updates `startedAt` / `finishedAt`.
  - Updates worker node telemetry in PostgreSQL (`activeContainers = active_containers + 1`, state = `'busy'`).
  - Inserts audit event (`CONTAINER_START`, `FAILED`, `STOPPED`).
- **`POST /:id/logs`**:
  - Validates payload with `DeploymentLogsPayloadSchema`.
  - Inserts log batch into `deployment_logs` table (`stream`, `level`, `message`, `timestamp`).

---

## 3. Verification & Quality Assurance

1. **Auth & Security Test Suite (`apps/api/test-auth.js`)**:
   - Expanded from 25 to 28 tests covering all endpoints, including internal worker result/logs routes.
   - Result: **28 passed, 0 failed**.
2. **End-to-End Integration Test Suite (`apps/api/test-phase4.js`)**:
   - Automated 18-step verification against live server, PostgreSQL, and Redis:
     - Worker registration.
     - Deployment creation (`queued` state).
     - Worker task polling & task delivery.
     - State transition verification (`queued` -> `building`).
     - Worker log batch streaming & retrieval via `GET /logs`.
     - Worker container result submission (`running`, port `49152`, container ID).
     - Database state inspection confirming `running` status and assigned host port.
     - Worker subsequent task polling returning `hasTask: false`.
     - Deployment cancellation lifecycle verification.
   - Result: **18 passed, 0 failed**.
3. **Static Analysis & Build**:
   - `pnpm check-types`: 0 errors across all 4 monorepo packages.
   - `pnpm lint`: 0 ESLint errors.
   - `pnpm --filter @cloud-without-clouds/api build`: Compiled ESM bundle successfully.
