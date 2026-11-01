# Team Pony - Bit N Build 2026 Finals

> **Notice:** This repository hosts **Cloud Without Clouds**, a distributed application hosting platform that enables developers to deploy applications from Git repositories onto a network of developer-owned computers.

---

# Cloud Without Clouds ⛅❌💻

A distributed, self-service application hosting platform that enables developers to deploy applications from Git repositories onto a network of developer-owned computers (laptops and desktops).

## Video Demo

https://drive.google.com/file/d/1_TShE6v-sk74qxO_cKtbilCUNWZ9rv30/view?usp=sharing

## 🚀 Overview

Instead of renting costly hyperscaler virtual machines, **Cloud Without Clouds** leverages idle compute capacity across personal computers. Developers deploy containerized web services and applications, while computer owners configure resource quotas, monitor CPU/memory usage, and safely isolate workloads.

### Project Maturity & Scope Classification

To ensure an achievable and realistic delivery during the hackathon, the platform strictly separates current progress from MVP and future goals:

- **Current Implementation:** Foundational monorepo structure (pnpm workspaces + Turborepo), shared Zod schemas and TypeScript contracts (`packages/shared`), base Express control-plane API with CORS, structured logging, and `/health` verification (`apps/api`), worker host metric collector stub (`apps/worker`), React dashboard shell with real-time health indicator (`apps/web`), and local Docker Compose infrastructure (PostgreSQL 16, Redis 7).
- **Agreed MVP Demo Milestone:** Deploying **one** Dockerfile-based application from a public Git repository onto **one** worker laptop, executing it inside a Docker container under hardcoded CPU and memory limits, and exposing it through a platform-generated URL (using Cloudflare Tunnel, or a zero-cost Quick Tunnel / Tailscale fallback if no custom domain is available).
- **Target Platform (Planned):** Multi-worker registration, resource-aware scheduler placement (preferring the least-loaded eligible worker), worker heartbeat lease tracking, and automatic redeployment of workloads onto another healthy worker upon node failure.

---

## 🌐 Networking, Domains & Zero-Cost Demo Fallback

The project is strictly designed to operate on free tiers and open-source tooling without requiring paid cloud infrastructure:

- **Cloudflare Tunnel (`cloudflared`):** The tunnel client is free and open-source. However, generating production-style wildcard subdomains (`https://<app>-<id>.<domain>`) requires DNS ownership and control of a registered domain configured on Cloudflare.
- **No Domain Assumption:** The team does not assume a custom domain is already registered or available during local development and judging.
- **Practical Demo Fallbacks:**
  1. **Cloudflare Quick Tunnel (Recommended Zero-Cost Fallback):** Running `cloudflared tunnel --url http://localhost:<port>` provides an ephemeral, public HTTPS URL (`https://<random-slug>.trycloudflare.com`) without requiring an account, credit card, or domain registration.
  2. **Tailscale Private Mesh / MagicDNS:** Deployments can be accessed directly by team members over the private Tailscale network via MagicDNS hostnames or private IPs (e.g., `http://100.x.y.z:<port>`).
  3. **Localhost Routing:** For local single-machine evaluation, container ports bind to `http://localhost:<assignedPort>`.

---

## 🛠️ Technology Stack

- **Monorepo:** [pnpm Workspaces](https://pnpm.io/workspaces) + [Turborepo](https://turbo.build/repo)
- **Frontend (`apps/web`):** React 18, Vite, TypeScript, Tailwind CSS v4, shadcn/ui, React Router, TanStack Query
- **UI Fonts:** Space Grotesk (headings), Geist (body/UI), Geist Mono (code/logs)
- **Control Plane API (`apps/api`):** Node.js (ESM), Express 4, TypeScript, Zod, CORS
- **Distributed Worker (`apps/worker`):** Node.js (ESM), TypeScript, Host Metric Monitoring, Docker Engine
- **Shared Package (`packages/shared`):** Single source of truth for Zod schemas, lifecycle enums, and TypeScript types
- **Local Infrastructure:** Docker Compose (PostgreSQL 16, Redis 7)
- **Overlay Networking:** Tailscale (encrypted WireGuard mesh)
- **Edge Ingress & Reverse Proxy:** Caddy v2, Cloudflare Tunnel (`cloudflared`)

---

## 📁 Repository Structure

```text
cloud-without-clouds/
├── apps/
│   ├── web/             # React + Vite frontend dashboard (@cloud-without-clouds/web)
│   ├── api/             # Express control-plane API (@cloud-without-clouds/api)
│   └── worker/          # Distributed worker agent (@cloud-without-clouds/worker)
├── packages/
│   └── shared/          # Shared types, interfaces, and Zod schemas (@cloud-without-clouds/shared)
├── deploy/
│   └── setup-tailscale.sh # Tailscale installation script for Ubuntu
├── docker-compose.yml   # PostgreSQL and Redis services
├── pnpm-workspace.yaml  # pnpm workspace definition
├── turbo.json           # Turborepo task pipeline configuration
├── package.json         # Root workspace scripts & dev tooling
├── tsconfig.base.json   # Base strict TypeScript configuration
├── .gitignore           # Git ignore rules
├── .env.example         # Environment template
├── AGENTS.md            # Contributor guidelines, security rules & commands
├── ARCHITECTURE.md      # Detailed system architecture, contracts & lifecycle
└── README.md            # Project overview and local getting-started guide
```

---

## 📋 Prerequisites

Before running the project locally, ensure you have:

- **Node.js:** `v20+` or `v22+` (`node -v`)
- **pnpm:** `v9+` or `v10+` (`pnpm -v`)
- **Docker & Docker Compose:** Installed and running (`docker compose version`)

---

## ⚙️ Environment Setup

1. Clone the repository and navigate into the root directory:
   ```bash
   cd cloud-without-clouds
   ```

2. Copy the example environment file:
   ```bash
   cp .env.example .env
   # Or on Windows PowerShell:
   Copy-Item .env.example .env
   ```

3. Review `.env` to customize ports and credentials if needed:
   - `PORT=4000` (Control Plane API)
   - `VITE_API_URL=http://localhost:4000` (Web UI API endpoint)
   - `DATABASE_URL=postgresql://cwc_user:cwc_password@localhost:5432/cloud_without_clouds?schema=public`
   - `REDIS_HOST=localhost`, `REDIS_PORT=6379`
   - `WORKER_ID=worker-node-local-01`, `WORKER_PORT=5001`
   - `WORKER_SECRET_TOKEN=dev-worker-secret-token-change-in-production`
   - `ADMIN_TOKEN=dev-admin-token-change-in-production` (MVP shared secret for deployment mutations)

---

## 📦 Installation & Build

Install all workspace dependencies from the root:
```bash
pnpm install
```

Build the shared package and applications:
```bash
pnpm build
```

---

## 🐳 Starting Local Infrastructure

Start PostgreSQL 16 and Redis 7 in background containers:
```bash
pnpm infra:up
# Or: docker compose up -d
```

Verify service health:
```bash
docker compose ps
```

Stop infrastructure when done:
```bash
pnpm infra:down
```

---

## 🏃 Running Applications

You can run all components simultaneously or target individual services.

### Run All Services in Parallel
```bash
pnpm dev
```

### Run Services Individually

- **Control Plane API (`http://localhost:4000`):**
  ```bash
  pnpm dev:api
  ```
  Health Check: `curl http://localhost:4000/health`

- **Frontend Dashboard (`http://localhost:5173`):**
  ```bash
  pnpm dev:web
  ```

- **Distributed Worker Node:**
  ```bash
  pnpm dev:worker
  ```

---

## 🔍 Verification & Quality Assurance

- **Type Checking:**
  ```bash
  pnpm check-types
  ```
- **Linting:**
  ```bash
  pnpm lint
  ```
- **Code Formatting:**
  ```bash
  pnpm format:check
  pnpm format
  ```

> [!NOTE]
> `pnpm check-types` and `pnpm lint` currently pass across all workspace packages. No automated unit/integration test runner is installed in `package.json` at this stage.

---

## 🗺️ Roadmap & Milestones

1. **Milestone 1 — Single-Worker MVP Demo (Agreed MVP):**
   - Submit public Git repository via Web Dashboard or API.
   - Worker clones repository, builds Docker image, and launches container with CPU (1.0 core) and memory (512 MB) limits.
   - Expose the running container via platform-generated URL (Cloudflare Tunnel, Quick Tunnel, or Tailscale fallback).
   - MVP authentication via `ADMIN_TOKEN` and `WORKER_SECRET_TOKEN`.
   - Worker task dispatch via HTTP polling (`GET /api/v1/workers/:id/tasks`).

2. **Milestone 2 — Multi-Worker Orchestration (Target Capabilities):**
   - Multi-worker registration and 10-second heartbeat telemetry.
   - Resource-aware scheduler placement engine using the least-loaded worker scoring formula.
   - Worker heartbeat timeout detector (30s) and automatic workload redeployment onto another eligible worker.
   - Real-time log streaming via SSE / WebSockets.

3. **Explicitly Out of Scope for Hackathon:**
   - Kubernetes / Nomad clustering.
   - Multi-replica application redundancy.
   - Private Git repository SSH keys / OAuth integrations.
   - Custom DNS registrar automation.
   - Paid cloud virtual machines.


GGS
