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
