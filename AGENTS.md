# Contributor & Agent Guidelines: Cloud without Clouds

## Agent skills

- **Issue tracker:** For local Markdown tickets and specs, see `docs/agents/issue-tracker.md`.
- **Triage labels:** For ticket status values, see `docs/agents/triage-labels.md`.
- **Domain docs:** For the shared glossary and architectural decisions, see `docs/agents/domain.md`.

Welcome to **Cloud without Clouds** (`cloud-without-clouds`), a distributed application hosting platform that enables developers to deploy Dockerfile-based applications from public Git repositories onto developer-owned laptops and desktop workstations acting as distributed worker nodes.

This document sets down binding guidelines, technical boundaries, development workflows, and operational guardrails for both human team members and AI coding agents.

---

## 1. Project Overview & Repository Structure

The platform is designed as an alternative to hyperscaler virtual machines by clustering idle compute on personal workstations across a private network mesh.

### Monorepo Architecture

The repository is configured as a monorepo managed with **pnpm workspaces** and **Turborepo** (`turbo.json`).

```text
cloud-without-clouds/
├── apps/
│   ├── api/                   # Express control-plane API (@cloud-without-clouds/api)
│   ├── web/                   # React + Vite frontend dashboard (@cloud-without-clouds/web)
│   └── worker/                # Node.js distributed host agent (@cloud-without-clouds/worker)
├── packages/
│   └── shared/                # Canonical Zod schemas & TS types (@cloud-without-clouds/shared)
├── deploy/
│   └── setup-tailscale.sh     # Tailscale node provisioning script for Ubuntu
├── docker-compose.yml         # Local backing infrastructure (PostgreSQL 16 & Redis 7)
├── package.json               # Root workspace scripts & dev dependencies
├── pnpm-workspace.yaml        # pnpm workspace configuration
├── turbo.json                 # Turborepo task pipeline definition
├── tsconfig.base.json         # Base TypeScript configuration (strict, NodeNext)
├── eslint.config.mjs          # Workspace-wide ESLint configuration
├── .env.example               # Template environment configuration
├── ARCHITECTURE.md            # System architecture, contracts & lifecycle specification
└── README.md                  # Project overview and local getting-started guide
```

---

## 2. Technology Stack & Architectural Boundaries

Contributors and agents must observe strict separation of concerns across workstreams:

| Subsystem | Package / App | Core Stack | Boundaries & Responsibilities |
| :--- | :--- | :--- | :--- |
| **Frontend** | `apps/web` | React 18, Vite, TypeScript, Tailwind CSS v4, Lucide React, TanStack Query, React Router | Presents user interfaces for apps, deployments, and worker status. Communicates exclusively with the Control Plane API via HTTP/JSON. Cannot execute Docker commands or talk directly to workers. |
| **Control Plane** | `apps/api` | Node.js (ESM), Express 4, TypeScript, Zod, CORS | Orchestrates deployments, maintains central state, tracks worker heartbeats, evaluates scheduling policies, and issues assignment instructions. Does not run Docker containers or clone source repos itself. |
| **Worker Agent** | `apps/worker` | Node.js (ESM), TypeScript, Zod, Host OS APIs, Docker CLI / Engine API | Runs on host machines; samples CPU/memory telemetry, authenticates to the control plane, pulls Git code, executes Docker builds, launches containers with resource caps, and reports health. |
| **Shared Contracts** | `packages/shared` | TypeScript, Zod, tsup | Single source of truth for domain models, validation schemas, and lifecycle enums (`worker.ts`, `deployment.ts`, `app-config.ts`, `health.ts`). Contains zero business or platform-specific runtime logic. |
| **Data Services** | Local Docker Compose | PostgreSQL 16 Alpine, Redis 7 Alpine | PostgreSQL provides persistent transactional storage; Redis provides task queues and ephemeral caching. Accessed exclusively by the Control Plane. |
| **Networking Mesh** | OS / WireGuard | Tailscale | Encrypted overlay mesh connecting the control plane to worker laptops without public port forwarding or router NAT modification. |
| **Ingress & Proxy** | Edge / Ingress | Caddy, Cloudflare Tunnel | Caddy provides reverse proxying to worker IPs/ports over Tailscale; Cloudflare Tunnel exposes platform URLs publicly without exposing public IP addresses. *(See Domain & URL Requirements below).* |

### Domain & URL Requirements & Demo Fallbacks
- **Zero Cost Constraint:** The project must not depend on paid services. Cloudflare Tunnel (`cloudflared`) is completely free to run.
- **Domain Ownership Clarification:** Custom platform URLs with wildcard subdomains (e.g. `https://<app>-<id>.<domain>`) require DNS control of a custom registered domain on Cloudflare. The team does **not** assume a custom domain is available.
- **Zero-Cost Demo Fallbacks:**
  1. **Cloudflare Quick Tunnel:** Running `cloudflared tunnel --url http://localhost:<port>` creates an ephemeral, public HTTPS URL (`*.trycloudflare.com`) with zero account or domain setup.
  2. **Tailscale Private Mesh / MagicDNS:** Deployments can be accessed directly by team members over Tailscale via MagicDNS hostnames or private IPs (`http://100.x.y.z:<port>`).
  3. **Localhost Demo:** For local single-machine evaluation, container ports bind to `http://localhost:<assignedPort>`.

---

## 3. Scope Boundaries & Team Ownership

### Scope Tiers: MVP Demo vs. Target Capabilities
- **Minimum MVP Requirement:** Deploying **one** public Git repository containing a Dockerfile onto **one** worker laptop, running it inside a container with enforced CPU/memory caps, and accessing it through a platform-generated URL (or demo fallback).
- **Target Capabilities (Not MVP Blockers):** Multi-worker registration, least-loaded resource-aware scheduling, worker heartbeat leases, and automatic redeployment after worker failure.
- **Target Scheduler Policy:** When multiple workers are supported, select a healthy, resource-eligible worker with the lowest load score $S(W)$ (favoring lower memory, lower CPU, and fewer active containers).
- **Target Recovery Behavior:** When a worker is declared offline (missed heartbeats $> 30$s), mark its deployments unavailable and attempt redeployment on another eligible worker.

### Four-Person Hackathon Team Ownership

1. **Frontend / Dashboard Workstream**
   - **Scope:** `apps/web`
   - **Key Deliverables:** Git deployment submission form, deployment history and log viewer, worker status dashboard, health indicator.
   - **Styling Requirements:** Headings: `Space Grotesk` (`--font-heading`); Body/UI: `Geist` (`--font-sans`); Code/Logs: `Geist Mono` (`--font-mono`).
2. **Control Plane / API & Scheduler Workstream**
   - **Scope:** `apps/api`, `docker-compose.yml`, database schemas
   - **Key Deliverables:** Deployment CRUD API, MVP authentication middleware, worker registration & heartbeat receiver, database persistence, task dispatch endpoint, and target least-loaded scheduler placement.
3. **Worker Agent / Runtime Workstream**
   - **Scope:** `apps/worker`
   - **Key Deliverables:** HTTP task poller, Git clone, Docker build/run lifecycle with mandatory CPU and memory limits, periodic heartbeat transmitter, log streaming.
4. **Build, Deployment Pipeline & Networking Workstream**
   - **Scope:** `deploy/`, Caddy reverse proxy integration, Cloudflare Tunnel / Quick Tunnel setup, Tailscale mesh connectivity.
   - **Key Deliverables:** End-to-end routing from platform-generated URLs (or fallback URLs) to container ports on Tailscale worker nodes.

> [!IMPORTANT]
> **Contract Rule:** No workstream may unilaterally alter contracts in `packages/shared`. Any schema changes, new fields, or state transitions require consensus and must maintain compatibility across `apps/api`, `apps/web`, and `apps/worker`.

---

## 4. Key Architectural Decisions for Implementation

### 1. MVP Authentication Model
To prevent blocking development with an overly complex user management system:
- **User / Admin Operations:** Mutating endpoints (`POST /api/v1/deployments`, `POST /api/v1/deployments/:id/cancel`) require an `Authorization: Bearer <ADMIN_TOKEN>` header matching `ADMIN_TOKEN` in `.env`. The control plane maps this to a single default administrator identity (`admin` / `default-user`).
- **Worker Node Operations:** Worker communication endpoints (`/api/v1/workers/register`, `/api/v1/workers/heartbeat`, `/api/v1/workers/status`, internal task/result endpoints) require `Authorization: Bearer <WORKER_SECRET_TOKEN>` matching `WORKER_SECRET_TOKEN` in `.env`.
- **Public Endpoints:** `GET /health` is unauthenticated.
- **Read-Only Endpoints:** `GET /api/v1/deployments` and `GET /api/v1/workers` can accept the admin token or run open in local dev mode.
- **Post-MVP:** Multi-tenant user accounts and OAuth login are deferred to future milestones.

### 2. Worker Task Dispatch Model
- **Mechanism:** Pull-based **HTTP Polling** using standard Node.js `fetch` (already used in `apps/worker`).
- **Workflow:**
  1. The worker polls `GET /api/v1/workers/:id/tasks` every 2–5 seconds (or inspects a task object in its 10-second heartbeat response).
  2. If a deployment task is pending, the worker receives a `DeploymentTaskPayload` (deployment ID, repository URL, branch, port, resource limits).
  3. Worker acknowledges receipt, updates state to `building`, and begins cloning and building.
  4. Once started, the worker reports the result (container ID, assigned port, status `running` or `failed`) via `POST /api/v1/internal/deployments/:id/result`.
- **Benefits:** Zero additional infrastructure, no WebSockets server complexity, and no external message broker required for the MVP. Redis remains available in `docker-compose.yml` for target queueing (e.g. BullMQ).

### 3. Database ORM Layer (Control Plane Workstream)
- **Standard:** **Drizzle ORM** (`drizzle-orm` + `drizzle-kit` with `pg` driver).
- **Guidelines:** Lightweight, TypeScript-native, zero binary bloat. Define schema in `apps/api/src/db/schema.ts` and generate migrations with `drizzle-kit generate`.

### 4. Edge Ingress & Reverse Proxy Sync (Pipeline Workstream)
- **Standard:** **Caddy Admin API (`POST http://localhost:2019/load`)** + **Cloudflare Quick Tunnel Fallback**.
- **Guidelines:** The control plane pushes JSON upstream updates to Caddy's REST Admin API on `localhost:2019`. For testing without a registered domain, expose the deployment using a free Cloudflare Quick Tunnel (`cloudflared tunnel --url http://localhost:<port>`) or Tailscale MagicDNS.

### 5. Container Port Allocation (Worker Runtime Workstream)
- **Standard:** **Docker Ephemeral Port Binding (`-p 0:<appPort>`)**.
- **Guidelines:** The worker starts containers with `-p 0:<targetPort>` (e.g. `docker run -d -p 0:3000 ...`). Docker automatically assigns an available host port. The worker inspects the assigned port (`docker inspect`) and reports it back to the control plane in `POST /api/v1/internal/deployments/:id/result`. This eliminates port collision bugs and port-tracking state.

---

## 5. Coding Conventions & Quality Standards

### TypeScript Strictness
- `tsconfig.base.json` enforces `"strict": true`, `"moduleResolution": "NodeNext"`, and `"isolatedModules": true`.
- **Never use `any`**. Use `unknown` with type narrowing or type assertions backed by Zod schemas.
- Ensure package imports use proper ESM extensions where required (e.g. `import { env } from './config/env.js';`).

### Schema Validation & Shared Types
- Always define data shapes first in `packages/shared` using Zod (`z.object(...)`).
- Derive TypeScript types via `z.infer<typeof Schema>` rather than duplicating interfaces.
- Validate every external payload at service boundaries:
  ```typescript
  const result = MySchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }
  ```

### Error Handling & Structured Logging
- Handle rejections explicitly; uncaught promises crash the process.
- Return structured error JSON responses from Express:
  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Invalid deployment payload",
      "details": []
    }
  }
  ```
- Use structured logging format (`[Module] Message`, metadata objects) rather than unstructured print statements.

### Simplicity & Practicality
- Adhere to the MVP scope. **Avoid overengineering**.
- Do not build custom microservice meshes, distributed consensus engines, multi-region failover, or custom domain DNS management for the hackathon MVP.
- Write clean, readable, modular TypeScript with high cohesion and low coupling.

---

## 6. Security Rules & Contributor Guardrails

Deploying untrusted third-party Git repositories onto personal machines requires strict security boundaries:

1. **Zero Secrets in Repository:**
   - Never commit `.env`, API tokens, private SSH keys, Cloudflare credentials, or Tailscale auth keys.
   - All secrets must be loaded via environment variables using `.env.example` as the canonical template.
2. **Treat User Repositories & Build Contexts as Untrusted:**
   - Any public Git URL could contain malicious code, path traversal attacks, or fork-bombs.
   - Restrict Git clone destinations to sandboxed, temporary directories (e.g., `/tmp/cwc-builds/<deployment-id>`).
   - Validate repository URLs: allow only public `https://` Git endpoints matching valid hostname patterns (e.g., `github.com`, `gitlab.com`).
3. **Isolate Privileged Docker Operations:**
   - The Control Plane API must **never** expose direct Docker socket access or arbitrary `docker run` flags to API clients.
   - All container invocations happen strictly inside `apps/worker` with hardcoded safety flags.
4. **Mandatory Container Resource Limits:**
   - Every container launched by a worker must enforce hard limits:
     - `--memory="<limit>m"` (e.g., 512m default, capping out-of-memory crashes on the host).
     - `--cpus="<limit>"` (e.g., 1.0 core default).
     - `--pids-limit=256` (prevent fork-bombs).
     - `--restart=on-failure:3` (prevent infinite crash-loops from consuming host resources).
5. **Never Trust Worker-Reported Telemetry Unconditionally:**
   - Workers report their own free memory and CPU loads. Validate limits on the Control Plane: if a worker reports negative numbers or impossible core counts, flag the node as `error` or reject registration.
6. **Network Isolation:**
   - Workers should only be accessible over the private Tailscale interface (`100.x.y.z`), never directly exposed on public IPv4/IPv6 interfaces.

---

## 7. Development Commands

The following commands are defined in the workspace `package.json` files and verified:

### Root Workspace Commands

| Command | Action | Implementation |
| :--- | :--- | :--- |
| `pnpm dev` | Starts all applications concurrently | Runs `turbo run dev` |
| `pnpm dev:api` | Starts only the Express Control Plane API | Runs `turbo run dev --filter=@cloud-without-clouds/api` (`tsx watch` on port 4000) |
| `pnpm dev:web` | Starts only the Vite Frontend Dashboard | Runs `turbo run dev --filter=@cloud-without-clouds/web` (Vite dev server on port 5173) |
| `pnpm dev:worker` | Starts only the Distributed Worker Agent | Runs `turbo run dev --filter=@cloud-without-clouds/worker` (`tsx watch`) |
| `pnpm build` | Builds all packages and applications | Runs `turbo run build` across all packages in topological order |
| `pnpm lint` | Runs ESLint across all packages | Runs `turbo run lint` |
| `pnpm check-types` | Type checks all packages with TypeScript | Runs `turbo run check-types` (`tsc --noEmit`) |
| `pnpm format` | Automatically formats codebase with Prettier | Runs `prettier --write "**/*.{ts,tsx,js,jsx,json,md,css}"` |
| `pnpm format:check` | Checks formatting compliance | Runs `prettier --check "**/*.{ts,tsx,js,jsx,json,md,css}"` |
| `pnpm infra:up` | Starts local PostgreSQL 16 and Redis 7 | Runs `docker compose up -d` |
| `pnpm infra:down` | Stops local PostgreSQL and Redis | Runs `docker compose down` |
| `pnpm infra:logs` | Streams PostgreSQL and Redis container logs | Runs `docker compose logs -f` |

### Package-Specific Build Commands
- `packages/shared`: `pnpm --filter @cloud-without-clouds/shared build` (`tsup src/index.ts --format cjs,esm --dts`)
- `apps/api`: `pnpm --filter @cloud-without-clouds/api build` (`tsup src/index.ts --format esm --out-dir dist`)
- `apps/api` worker networking checks: `pnpm --filter @cloud-without-clouds/api test:worker-network` (requires API, PostgreSQL, and Redis)
- `apps/api` cancellation and queue progression check: `pnpm --filter @cloud-without-clouds/api test:cancellation-ack` (requires API, PostgreSQL, and migrations)
- `apps/api` stale runtime route check: `pnpm --filter @cloud-without-clouds/api test:runtime-failure-cleanup` (requires API, PostgreSQL, and migrations)
- `apps/api` worker restart reconciliation check: `pnpm --filter @cloud-without-clouds/api test:heartbeat-reconciliation` (requires API, PostgreSQL, and migrations)
- `apps/worker`: `pnpm --filter @cloud-without-clouds/worker build` (`tsup src/index.ts --format esm --out-dir dist`)
- `apps/worker` Tailscale discovery check: `pnpm --filter @cloud-without-clouds/worker test:tailscale-address`
- `apps/web`: `pnpm --filter @cloud-without-clouds/web build` (`tsc -b && vite build`)

---

## 8. Testing & Verification Expectations

### Current Codebase Status
- **Type Checking:** Verified passing across all 4 packages via `pnpm check-types`.
- **Linting:** Verified passing across all 4 packages via `pnpm lint`.
- **Format Checking:** Codebase contains file line-ending variations across OS platforms; run `pnpm format` when preparing commits.
- **Automated Tests:** As of the current repository state, **no unit or integration test suite runner (such as Vitest or Jest) is installed in `package.json`**. Do not invent test commands or claim automated unit tests pass.

### Verification Checklist Before Submitting Code
Before marking any feature complete or submitting a pull request, contributors and AI agents must run and verify:
1. `pnpm check-types` (must exit with code 0).
2. `pnpm lint` (must pass with no ESLint errors).
3. If new dependencies or exports are added to `packages/shared`, run `pnpm build` to confirm CJS/ESM/DTS artifacts compile cleanly.
4. Verify that `.env.example` is updated if any new environment variable is introduced.

---

## 9. Git Workflow & Collaboration Guidelines

1. **Branching Strategy:**
   - `main`: Protected production-ready branch.
   - Work branch naming convention:
     - `feature/api-scheduler`
     - `feature/worker-docker-runner`
     - `feature/web-deployment-form`
     - `fix/heartbeat-timeout`
2. **Focused Commits:**
   - Keep commits small, atomic, and message them clearly:
     `feat(worker): implement docker build and run lifecycle with memory caps`
     `fix(api): handle missing worker error in deployment lookup`
3. **Cross-Workstream Boundaries:**
   - Do not modify another workstream's application files without direct alignment.
   - Keep pull requests focused; do not reformat unrelated files in the same branch.
4. **Pull Request Protocol:**
   - Verify `pnpm check-types` and `pnpm lint` pass before requesting review.
   - Document any database migrations, schema additions, or new configuration flags in the PR description.

---

## 10. Documentation Maintenance

Documentation must evolve in lockstep with the codebase:
- When modifying shared schemas in `packages/shared/src/`, immediately update the contracts in `ARCHITECTURE.md`.
- When adding or changing scripts in `package.json`, update Section 7 of `AGENTS.md`.
- If an architectural unknown or trade-off is resolved, move it from the **Open Decisions** section in `ARCHITECTURE.md` into the implemented specifications.
