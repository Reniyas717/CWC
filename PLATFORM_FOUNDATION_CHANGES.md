# Changes Summary: Platform Foundation Merge

**Date:** 2026-10-31
**Merge commit:** `a5e504d` — *Merge platform foundation improvements*
**Merged branch:** `feature/platform-foundation` (`b99a863`) into `main`
**Scope:** 53 files changed, +5,380 / −1,754 lines across the control plane, worker agent, web dashboard, gateway, and shared contracts.

---

## 1. Overview

This merge integrated the full platform-foundation workstream into `main`: hardening the deployment lifecycle (atomic task claims, stale-result protection, worker-loss recovery), making worker networking private-by-default (validated Tailscale addresses, private port binding), giving the public-ingress gateway a tracked, reconcilable route lifecycle, and replacing the dashboard's mock data with live control-plane data. Main's concurrent capacity-weighted cluster equalizer work was preserved and re-unified with the foundation changes.

---

## 2. Control Plane (`apps/api`)

### 2.1 Atomic task claims (`a862f60`)
- Worker task dispatch now claims work atomically, preventing two workers from receiving the same deployment.
- Each claim mints a unique `attemptId` recorded on the deployment (`apps/api/src/db/schema.ts`, Drizzle migrations `0002`/`0003`).

### 2.2 Stale deployment result protection (`5a05dd1`, `bddbccc`)
- `POST /api/v1/internal/deployments/:id/result` validates the reported `attemptId` against the current claim; stale results from displaced or reconnecting workers are rejected with `409` and cannot revive old work.
- Deployment routes are preserved across result processing instead of being unconditionally rewritten.

### 2.3 Worker-loss deployment recovery (`ac2986b`)
- The sweeper (`apps/api/src/services/sweeper.ts`) marks deployments on workers with missed heartbeats (> 30 s) as recoverable and re-queues them for placement on another eligible worker.
- Deployment deletion is blocked while a deployment is still in the `deploying` state (`ac6568a`), and route cleanup completes before a replacement is allowed (`f692dfb`).

### 2.4 Public route lifecycle (`04eb78f`, `4fbadd1`, `0d4a59a`, `dd6ed88`)
- New `routingStatus` (`pending` | `ready` | `failed`), `routingError`, and `workerUrl` fields track the ingress route independently from the container lifecycle.
- New gateway client reconciliation service (`apps/api/src/services/gateway-reconciliation.ts`) retries failed route publications (3 attempts with backoff) and reconciles routes on startup.
- New route-cleanup service (`apps/api/src/services/route-cleanup.ts`) safely removes stale gateway routes.
- Gateway routes must carry a complete route identity (`deploymentId` + `attemptId` + upstream) before publication is accepted.

### 2.5 Applications API (`91461e6`)
- New `apps/api/src/routes/applications.ts` exposes the application registry to the dashboard (wired in `routes/index.ts`).

### 2.6 Scheduler
- Queued-deployment re-scheduling now skips deployments that already carry a `routingError` (`isNull(deployments.routingError)` in `schedulePendingDeployments`), preventing infinite retry of unroutable deployments.
- Main's capacity-weighted equalizer (`rebalanceClusterWorkloads`, `POST /api/v1/workers/rebalance`) was kept intact through the merge.

---

## 3. Worker Agent (`apps/worker`)

### 3.1 Validated Tailscale worker addresses (`cf5b449`)
- Worker registration requires a worker-reported `ipAddress` inside Tailscale's `100.64.0.0/10` range; the control plane stores that value instead of inferring an upstream from the HTTP transport peer.
- New discovery module `apps/worker/src/services/tailscale-address.ts` (with `TAILSCALE_IP` override) fails closed when no valid Tailscale IPv4 is found.
- Verification script: `pnpm --filter @cloud-without-clouds/worker test:tailscale-address`.

### 3.2 Private port binding (`f7fd4a8`)
- Containers are launched with `-p <tailscale-ip>:0:<targetPort>` instead of wildcard bindings, so apps are only reachable over the private mesh.
- `apps/worker/src/services/docker-engine.ts` inspects Docker's actual `HostIp`/`HostPort` and **rejects** wildcard (`0.0.0.0`, `::`) or mismatched bindings, removes the container, and reports the deployment as failed (private routing unavailable — common on Windows/WSL Docker Desktop).
- Health checks probe `http://<tailscale-ip>:<port>/`, the same address the gateway routes to.
- Verification script: `pnpm --filter @cloud-without-clouds/worker exec tsx src/test-private-port-binding.ts` (no dedicated npm script yet).

### 3.3 Stale-result-safe reporting (`bddbccc`)
- On a `409` result rejection the worker removes its now-unwanted running container and unregisters it, preventing orphaned work on the host.
- Active `attemptId`s are tracked per deployment (`activeAttemptIds` map).

---

## 4. Web Dashboard (`apps/web`)

### 4.1 Truthful deployment dashboard (`27e75c9`, `4618bf6`)
- Deployment views require real control-plane responses instead of silently rendering local mock fallbacks.
- New `ApiRequestError` with `status`/`code` and a shared `requestJson` helper (`apps/web/src/services/api.ts`) unify error handling; network failures surface as explicit "control plane unavailable" states.

### 4.2 Live platform data (`91461e6`)
- Applications, deployments, logs, workers, and dashboard pages all read live API data (TanStack Query with 5 s refresh) instead of `localStorage` registries.
- New `DataError` component (`apps/web/src/components/ui/data-error.tsx`) renders consistent error states with retry actions on every page.

### 4.3 Equalizer UI integration
- The Load Equalizer pages (`EqualizerPage`, `RelocateWorkloadModal`) and their API client methods (`rebalanceCluster`, `relocateDeployment`) were restored through the merge, and Dashboard/Workers pages link to `/equalizer`.

---

## 5. Gateway & Networking (`deploy/`)

- `deploy/gateway/gateway.mjs` rewritten around complete route identity: routes are keyed by deployment + attempt, health-tracked, and garbage-collected when deployments disappear or are reassigned.
- `deploy/gateway/gateway.test.mjs` expanded (538 changed lines) to cover route publication, identity enforcement, stale-route cleanup, and reconciliation.
- New `deploy/verification/cross-laptop-runbook.md`: step-by-step runbook for verifying end-to-end deployments across two laptops over Tailscale.

---

## 6. Shared Contracts (`packages/shared`)

- `DeploymentSchema`: new optional fields `attemptId`, `workerUrl`, `routingStatus`, `routingError`; new `RoutingStatusSchema` enum.
- New `GatewayPublishedRouteSchema`, `GatewayPublishedRouteResponseSchema`, `GatewayReconciliationResponseSchema` describing the gateway's publish/reconcile contract.
- `worker.ts`: new `TailscaleIpv4Schema` restricting worker addresses to `100.64.0.0/10`; task payloads carry `attemptId`.
- All contract changes are additive/optional, keeping backward compatibility across `apps/api`, `apps/web`, and `apps/worker`.

---

## 7. New Verification Scripts

| Command | Purpose |
| :--- | :--- |
| `pnpm --filter @cloud-without-clouds/api test:task-claim` | Atomic task claim behavior |
| `pnpm --filter @cloud-without-clouds/api test:result-ownership` | Stale-result rejection (`409`) |
| `pnpm --filter @cloud-without-clouds/api test:worker-recovery` | Redeployment after worker loss |
| `pnpm --filter @cloud-without-clouds/api test:worker-network` | Tailscale address validation at registration |
| `node apps/api/test-gateway-client.mjs` | Gateway client publish/reconcile |
| `pnpm --filter @cloud-without-clouds/worker test:tailscale-address` | Tailscale interface discovery |
| `pnpm --filter @cloud-without-clouds/worker exec tsx src/test-private-port-binding.ts` | Private Docker binding validation |

(These scripts require the local infrastructure from `pnpm infra:up`; there is still no unit-test runner installed in the workspace.)

---

## 8. Merge-Time Conflict Resolution

Five files conflicted between `main` (equalizer/dashboard work) and `feature/platform-foundation`:

| File | Resolution |
| :--- | :--- |
| `apps/api/src/services/scheduler.ts` | Kept main's `rebalanceClusterWorkloads` equalizer + the branch's `isNull(routingError)` scheduling guard |
| `apps/api/src/routes/workers.ts` | Kept the branch's worker routes + main's `POST /workers/rebalance` endpoint |
| `apps/web/src/pages/DashboardPage.tsx` | Branch's live-data dashboard + main's Load Equalizer nav link |
| `apps/web/src/pages/WorkersPage.tsx` | Branch's live worker data + main's equalizer actions |
| `apps/web/src/services/api.ts` | Branch's error-handling refactor + restored main's `relocateDeployment()` and `rebalanceCluster()` client methods |

Post-merge cleanup removed unused imports/variables in `EqualizerPage.tsx`, `RelocateWorkloadModal.tsx`, and `WorkersPage.tsx` that broke `tsc --noEmit`.

**Verification after resolution:** `pnpm check-types` and `pnpm lint` both pass across all 4 packages.

---

## 9. Known Remaining Gaps

- The **two-laptop failover runbook** (`deploy/verification/cross-laptop-runbook.md`) has **not** been executed end-to-end; the last attempt aborted when the local gateway under test became unreachable.
- Several verification scripts depend on running PostgreSQL/Redis and a live gateway; they are smoke scripts, not an automated test suite.
- `git diff --check` reports pre-existing trailing whitespace from cross-platform line endings; run `pnpm format` before committing if a clean check is required.
