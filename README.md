# Team Pony - Bit N Build 2026 Finals

> **Notice:** This repository hosts **Cloud Without Clouds**, a distributed application hosting platform that enables developers to deploy applications from Git repositories onto a network of developer-owned computers.

---

# Cloud Without Clouds ⛅❌💻

A distributed, self-service application hosting platform that enables developers to deploy applications from Git repositories onto a network of developer-owned computers (laptops and desktops).

## 🚀 Overview

Instead of renting costly hyperscaler virtual machines, **Cloud Without Clouds** leverages idle compute capacity across personal computers. Developers deploy containerized web services and applications, while computer owners configure resource quotas, monitor CPU/memory usage, and safely pause or detach workloads. The platform features an intelligent, resource-aware scheduler and automatic failover across live worker nodes.

---

## 🛠️ Technology Stack

- **Monorepo:** [pnpm Workspaces](https://pnpm.io/workspaces) + [Turborepo](https://turbo.build/repo)
- **Frontend (`apps/web`):** React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, React Router, TanStack Query
- **Backend (`apps/api`):** Node.js, Express, TypeScript, Zod, CORS, Request Logging
- **Distributed Worker (`apps/worker`):** Node.js, TypeScript, Host Metric Monitoring, Container Agent
- **Shared Package (`packages/shared`):** TypeScript types & Zod schemas for worker states, deployments, and app configs
- **Local Infrastructure:** Docker Compose (PostgreSQL 16, Redis 7)
- **Validation:** Zod
- **Code Quality:** ESLint & Prettier

---

## 📁 Repository Structure

```text
cloud-without-clouds/
├── apps/
│   ├── web/             # React + Vite frontend dashboard
│   ├── api/             # Express control-plane API
│   └── worker/          # Distributed worker agent
├── packages/
│   └── shared/          # Shared types, interfaces, and Zod schemas
├── docker-compose.yml   # PostgreSQL and Redis services
├── pnpm-workspace.yaml  # pnpm workspace definition
├── turbo.json           # Turborepo task pipeline configuration
├── package.json         # Root workspace scripts & dev tooling
├── tsconfig.base.json   # Base strict TypeScript configuration
├── .gitignore           # Git ignore rules
├── .env.example         # Environment template
└── README.md            # Project documentation
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

3. Review `.env` to customize ports and database credentials if needed:
   - `PORT=4000` (Control Plane API)
   - `VITE_API_URL=http://localhost:4000` (Web UI API endpoint)
   - `DATABASE_URL=postgresql://cwc_user:cwc_password@localhost:5432/cloud_without_clouds?schema=public`
   - `REDIS_HOST=localhost`, `REDIS_PORT=6379`
   - `WORKER_ID=worker-node-local-01`, `WORKER_PORT=5001`

---

## 📦 Installation

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
- **Code Formatting:**
  ```bash
  pnpm format:check
  pnpm format
  ```
- **Turborepo Production Build:**
  ```bash
  pnpm build
  ```

---

## 🗺️ Roadmap & Upcoming Milestones

1. **Worker Registration Handshake:** Authenticated token-based enrollment and heartbeat telemetry.
2. **Git Clone & Container Build Pipeline:** Automated Docker containerization of Node.js and Python repositories.
3. **Resource-Aware Scheduling:** Real-time CPU/memory placement engine with replica distribution.
4. **Edge Reverse Proxy & HTTPS:** Dynamic ingress routing with automatic worker failover.
