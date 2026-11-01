# Cloud Without Clouds: Product & Feature Catalog
### Dual-Level Guide: Technical Implementation & User POV / UI-UX Experience

> **Classification:** Product Architecture, Feature Catalog & UX Specification  
> **Document Purpose:** Complete reference breaking down every feature in the Cloud Without Clouds platform across two distinct layers:
> 1. **Technical Architecture Level:** Algorithms, code paths, data models, background processes, APIs, and failure modes.
> 2. **User POV / UI-UX Level:** Screen layouts, visual indicators, user journeys, interactive controls, and presentation pitch talking points.

---

## 1. Network Dashboard & Telemetry Fabric

### 1.1 Technical Architecture Level
- **Core Files:** [`apps/web/src/pages/DashboardPage.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/pages/DashboardPage.tsx), [`apps/web/src/components/analytics/ClusterAnalyticsView.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/components/analytics/ClusterAnalyticsView.tsx), [`apps/api/src/routes/deployments.ts`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/api/src/routes/deployments.ts), [`apps/api/src/routes/workers.ts`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/api/src/routes/workers.ts).
- **Data Hydration:** Uses TanStack Query (`useQuery`) with a strict 5000ms polling interval querying three endpoints: `GET /api/v1/workers`, `GET /api/v1/deployments`, and `GET /api/v1/workers/scores?memoryMb=512`.
- **Derived Metrics:**
  - `onlineWorkers`: Filtered by `state !== 'offline'`.
  - `runningCount`: Filtered by `state === 'running'`.
  - `readyRoutes`: Filtered by `state === 'running' && routingStatus === 'ready' && publicUrl.startsWith('https://')`.
  - `ingressStatus`: Tri-state logic (`Live` if `readyRoutes > 0`, `Idle` if empty, `Pending` otherwise).
- **Fault Tolerance:** Each query is wrapped in `<DataError />` boundaries with manual `refetch()` triggers. If backend APIs are unreachable, client-side caching in `api.ts` hydrates metrics from `localStorage` without unhandled runtime exceptions.

### 1.2 User POV & UI/UX Experience Level
- **User Goal:** At a glance, understand cluster capacity, active workloads, scheduling status, and edge routing health within 3 seconds of logging in.
- **Visual Layout:**
  - **Header Controls:** Page title with direct quick-action buttons: *FinOps Arbitrage* (emerald badge button), *Failover Chaos Drill* (destructive red pill), *Load Equalizer* (scale icon), and *Deploy Application* (primary button).
  - **4 Top KPI Cards:** Active Workers, Active Workloads, Scheduling Policy ($S(W)$ Least-Loaded indicator), and Ingress & Gateway status.
  - **Embedded FinOps Widget:** Immediate cost avoidance and session savings ticker displayed above the master tables.
  - **Cluster Analytics View:** Real-time memory allocation gauges, CPU usage bars, and container capacity fractions per worker.
  - **Master Fleet Grid (7:5 Split):** Recent deployments with status pills and live gateway tunnel links on the left; registered worker nodes with live heartbeat age indicators on the right.
- **Judge Pitch Highlight:** *"The dashboard gives CTOs immediate executive visibility: live cluster health on the top, instant cost avoidance in the middle, and container orchestration telemetry on the bottom."*

---

## 2. Git-to-Container Application Deployment Workflow

### 2.1 Technical Architecture Level
- **Core Files:** [`apps/web/src/pages/ApplicationsPage.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/pages/ApplicationsPage.tsx), [`apps/web/src/components/applications/NewApplicationModal.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/components/applications/NewApplicationModal.tsx), [`apps/api/src/routes/applications.ts`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/api/src/routes/applications.ts), [`apps/worker/src/services/git-runner.ts`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/worker/src/services/git-runner.ts), [`apps/worker/src/services/docker-engine.ts`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/worker/src/services/docker-engine.ts).
- **Submission Lifecycle:**
  1. Frontend submits `CreateAppInput` to `POST /api/v1/applications`.
  2. Control plane validates repository URL (must match public HTTPS pattern `github.com/*` or `gitlab.com/*`), generates slug, and persists record in PostgreSQL.
  3. `POST /api/v1/deployments` creates initial deployment record with status `pending`.
  4. Scheduler assigns job to winning worker $W^*$, setting status `queued` with unique `attemptId`.
  5. Worker polls `GET /api/v1/workers/:id/tasks`, claims task, transitions status to `building`.
  6. Worker clones Git branch into sandboxed directory `/tmp/cwc-builds/<depId>` via `git clone --depth 1`.
  7. Worker executes `docker build -t cwc-<appSlug>:<depIdPrefix> .`.
  8. Worker executes `docker run -d -p <tailscaleIp>:0:<targetPort> --memory="<limit>m" --cpus="<limit>" --pids-limit=256 ...`.
  9. Worker inspects ephemeral host port via `docker inspect` and posts result to `POST /api/v1/internal/deployments/:id/result`.
- **Security Invariant:** Worker executes clones in ephemeral paths with non-root contexts; Docker container ports bind strictly to the private Tailscale IP, never `0.0.0.0`.

### 2.2 User POV & UI/UX Experience Level
- **User Goal:** Deploy any Dockerfile-based web app simply by pasting a GitHub URL, without provisioning servers, configuring SSH keys, or setting up cloud accounts.
- **User Journey:**
  1. Click **Deploy Application** from the dashboard or applications page.
  2. Modal opens asking for:
     - **Application Name** (e.g. `My Node API`)
     - **Git Repository URL** (e.g. `https://github.com/org/repo`)
     - **Git Branch** (defaults to `main`)
     - **Target Container Port** (e.g. `3000`, `8080`)
     - **Resource Caps** (Memory: 256MB to 2048MB, CPU: 0.5 to 2.0 cores)
     - **Environment Variables** (key-value pairs with secret toggle)
  3. Click **Deploy**. The modal transitions into an animated deployment progress view.
  4. Once running, a green badge appears with the live HTTPS tunnel link ready to open.
- **Judge Pitch Highlight:** *"Developers get the Heroku/Vercel developer experience for arbitrary Docker containers, hosted 100% on their team's existing machines."*

---

## 3. Animated 6-Stage Deployment Pipeline Visualizer

### 3.1 Technical Architecture Level
- **Core Files:** [`apps/web/src/components/deployments/AnimatedPipeline.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/components/deployments/AnimatedPipeline.tsx).
- **Pipeline Abstraction:** Models the distributed deployment lifecycle across 6 discrete stages:
  1. `git`: Source Ingestion (URL validation, shallow clone, commit hash pinning).
  2. `buildpack`: Container Synthesis (Dockerfile detection, multi-stage layer caching).
  3. `sandbox`: Host Containment (cgroups limit enforcement, PID limits, restart caps).
  4. `scheduler`: Placement Topology ($S(W)$ Least-Loaded node evaluation).
  5. `mesh`: WireGuard Transit (Tailscale private peer interface binding `100.x.y.z`).
  6. `ingress`: Public Route Synthesis (Caddy reverse proxy load + Cloudflare edge tunnel).
- **Interactive State Model:** Each stage exposes deep architectural metadata: *What happens*, *How it works under the hood*, *The distributed problem it solves*, and *Security guardrails enforced*.

### 3.2 User POV & UI/UX Experience Level
- **User Goal:** Understand exactly what the platform does at every phase of deployment without reading logs or reading code.
- **Visual Layout:**
  - Interactive stage carousel with progress connectors.
  - Active pulsing ring on the currently executing stage.
  - Clicking any stage opens an architectural inspect card breaking down the technical mechanics, kernel primitives, and security protections for that step.
- **Judge Pitch Highlight:** *"Judges see that our platform isn't a black box script. It has a rigorous 6-stage lifecycle engineered for security, isolation, and automated mesh routing."*

---

## 4. Cloud Cost Arbitrage & FinOps Command Center

### 4.1 Technical Architecture Level
- **Core Files:** [`apps/api/src/services/finops-calculator.ts`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/api/src/services/finops-calculator.ts), [`apps/api/src/routes/finops.ts`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/api/src/routes/finops.ts), [`apps/web/src/pages/FinOpsPage.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/pages/FinOpsPage.tsx), [`apps/web/src/components/finops/FinOpsArbitrageWidget.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/components/finops/FinOpsArbitrageWidget.tsx).
- **Dynamic Calculation Algorithm:**
  - Reads active nodes ($W_{\text{active}}$) and running workloads ($D_{\text{running}}$).
  - Compute Benchmarking: $\text{Compute} = (\sum \text{vCPUs} \times \$12.50) + (\sum \text{RAM}_{\text{GB}} \times \$4.25)$.
  - Networking Benchmarking: $\text{ALB} = \$16.20 + (N_{\text{routes}} \times \$7.20) + (N_{\text{routes}} \times \$4.50\text{ egress})$.
  - AWS Instance Classification: Automatically maps aggregated cluster RAM to the closest AWS Graviton EC2 tier (`t4g.large`, `t4g.xlarge`, `t4g.2xlarge`).
  - ESG Green Compute: $\text{Carbon} = \text{RAM}_{\text{GB}} \times 0.507\text{ kg CO}_2/\text{mo}$; $\text{Trees} = (\text{Annual Carbon}) / 21$.
- **High-Frequency Ticker Engine:** Browser-side `setInterval` runs at 100ms intervals, incrementing session savings:
  $$\text{Session Saved} = (t_{\text{now}} - t_{\text{sessionStart}}) \times \frac{\Delta_{\text{monthly}}}{2,592,000\text{ seconds}}$$

### 4.2 User POV & UI/UX Experience Level
- **User Goal:** Quantify the monetary value saved by the platform and present a compelling business pitch to CTOs, financial controllers, and hackathon judges.
- **Visual Layout:**
  - **Transparency Banner:** Explicit note stating zero AWS accounts are needed; calculations compare against public AWS retail cards to quantify value.
  - **Live Arbitrage Ticker:** Top-right glowing pill ticking up real-time session dollars saved (`+$0.00341...`).
  - **4 Hero Badges:** Monthly Arbitrage (\$358.60/mo), Aggregated Compute (28 GB RAM • 16 vCPUs), Commercial Equivalent (`1x AWS t4g.2xlarge`), and Green ESG Offset (14.2 kg CO₂).
  - **Side-by-Side Invoice Cards:**
    - Left (Red): Traditional Cloud Benchmark (AWS retail rates for compute, ALB, and egress).
    - Right (Green): Cloud Without Clouds Mesh (\$0.00 bill for silicon, WireGuard transit, and edge tunnels).
  - **Microservice Arbitrage Breakdown:** Table showing each running container and its equivalent AWS ECS Fargate container cost (\$29.50/mo vs \$0.00).
- **Judge Pitch Highlight:** *"We turn idle developer laptops into pure financial gross margin. What would cost \$4,300/year on AWS costs \$0.00 on Cloud Without Clouds."*

---

## 5. Interactive Engineering Team Scaling ROI Simulator

### 5.1 Technical Architecture Level
- **Core Files:** [`apps/web/src/components/finops/FinOpsArbitrageWidget.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/components/finops/FinOpsArbitrageWidget.tsx).
- **Mathematical Simulation Model:**
  - Given user-selected fleet size $N \in [1, 50]$:
    $$\text{Avg vCPU} = \frac{\text{Total Cluster vCPU}}{N_{\text{active}}}, \quad \text{Avg RAM} = \frac{\text{Total Cluster RAM}}{N_{\text{active}}}$$
    $$\text{Simulated vCPUs} = \text{round}(\text{Avg vCPU} \times N), \quad \text{Simulated RAM} = \text{round}(\text{Avg RAM} \times N)$$
    $$\text{Sim Monthly Avoided} = (\text{Sim vCPUs} \times 12.50) + (\text{Sim RAM} \times 4.25) + \text{Networking Overhead}$$
    $$\text{Sim Annual Avoided} = \text{Sim Monthly} \times 12$$
    $$\text{Sim Annual Carbon Offset} = \text{Sim RAM} \times 0.507 \times 12\text{ kg CO}_2$$
- **Re-render Optimization:** Slider updates are computed synchronously in local React state, allowing smooth 60fps drag recalculation.

### 5.2 User POV & UI/UX Experience Level
- **User Goal:** Explore what happens to organizational compute capacity and annual cloud budget when 5, 10, 25, or 50 team members join the mesh.
- **Visual Controls:**
  - Smooth interactive slider ranging from 1 to 50 workstations.
  - Real-time updating projection tiles: Simulated Compute, Monthly AWS Bill Saved, Annual Capital Saved, and Annual CO₂ Offsetting (with mature tree equivalent).
  - Dynamic CTO Takeaway box dynamically updating the dollar amount and developer count in prose.
- **Judge Pitch Highlight:** *"Watch what happens when an engineering department of 25 developers joins our mesh: they generate 400GB RAM of distributed compute and eliminate over \$28,000/year in hyperscaler cloud waste."*

---

## 6. $S(W)$ Least-Loaded Scheduler & Placement Topology

### 6.1 Technical Architecture Level
- **Core Files:** [`apps/api/src/services/scheduler.ts`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/api/src/services/scheduler.ts), [`apps/web/src/components/analytics/ClusterAnalyticsView.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/components/analytics/ClusterAnalyticsView.tsx).
- **Placement Algorithm:**
  - Evaluates all registered nodes through the 4-tier eligibility gate (`state in ('idle', 'busy')`, heartbeat $\le 30\text{s}$, active containers $<$ max capacity, free RAM $\ge$ requested RAM).
  - Computes normalized load score:
    $$S(W) = 0.4 \times \frac{M_{\text{used}}}{M_{\text{total}}} + 0.4 \times \frac{\text{CPU}_{\%}}{100} + 0.2 \times \frac{C_{\text{active}}}{C_{\text{max}}}$$
  - Selects minimum score node $W^* = \arg\min S(W)$.
  - Sets deployment state to `queued`, increments worker `activeContainers`, and records audit event in `deployment_events`.

### 6.2 User POV & UI/UX Experience Level
- **User Goal:** Trust that the system will never overload a single developer's machine and will intelligently distribute workloads across available compute.
- **Visual Feedback:**
  - Dedicated **Cluster Analytics** component on the dashboard showing every worker's $S(W)$ score breakdown: Memory Ratio, CPU Ratio, and Container Ratio.
  - Green checkmark for eligible nodes; red warning tags displaying exact rejection reasons (e.g. *Insufficient free memory*, *Concurrency capacity exhausted*).
- **Judge Pitch Highlight:** *"Our scheduler doesn't do naive round-robin. It continuously scores nodes across memory pressure, CPU saturation, and container density to place workloads on the least-burdened machine."*

---

## 7. Cluster Resource Equalizer & Workload Relocation

### 7.1 Technical Architecture Level
- **Core Files:** [`apps/web/src/pages/EqualizerPage.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/pages/EqualizerPage.tsx), [`apps/web/src/components/balancer/RelocateWorkloadModal.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/components/balancer/RelocateWorkloadModal.tsx), [`apps/api/src/routes/workers.ts`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/api/src/routes/workers.ts).
- **Skew Metric & Rebalance Plan:**
  - Analyzes memory allocation across online workers: $\text{Skew} = (\max \text{Ratio} - \min \text{Ratio}) \times 100\%$.
  - Generates workload migration plans targeting workers with the lowest utilization ratios.
  - Endpoint `POST /api/v1/workers/rebalance` supports `{ dryRun: true }` for previewing migrations and `{ dryRun: false }` for live execution.
  - Relocation updates the deployment's `workerId`, re-provisions the proxy upstream, and stops the container on the source node.

### 7.2 User POV & UI/UX Experience Level
- **User Goal:** Identify cluster resource imbalances and rebalance workloads across workstations with a single click.
- **Visual Controls:**
  - Cluster Imbalance Progress Bar with green/amber threshold indicators.
  - **Relocate Workload Modal:** Select any running application, inspect its current host, view candidate destination workstations with live available memory badges, and click **Relocate Workload**.
- **Judge Pitch Highlight:** *"As team members open or close laptops throughout the day, the Cluster Equalizer keeps the fleet balanced so no developer experiences lag."*

---

## 8. Failover Chaos Drill & Auto-Recovery Simulator

### 8.1 Technical Architecture Level
- **Core Files:** [`apps/api/src/services/sweeper.ts`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/api/src/services/sweeper.ts), [`apps/web/src/components/chaos/FailoverSimulatorModal.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/components/chaos/FailoverSimulatorModal.tsx).
- **Chaos Injection Mechanism:**
  - `POST /api/v1/workers/:id/simulate-dropout` artificially backdates the target worker's `lastHeartbeatAt` timestamp by 45 seconds ($> 30\text{s}$ timeout).
  - Triggers the background sweeper immediately.
  - Sweeper marks target node `offline`, purges Redis lease, unbinds Caddy proxy route, increments deployment `retryCount`, and re-queues workloads for placement on another node.
  - Retries capped at `MAX_RETRY_COUNT = 3`.

### 8.2 User POV & UI/UX Experience Level
- **User Goal:** Safely test and demonstrate the platform's self-healing capabilities live during a demo or pitch.
- **User Journey:**
  1. Click the red **Failover Chaos Drill** button in the dashboard header.
  2. Modal displays all online worker nodes.
  3. Select a target worker carrying running workloads.
  4. Click **Simulate Worker Dropout**.
  5. The modal logs the simulated network crash in real-time.
  6. Behind the modal, the target worker flips to `offline`, and the workload transitions to `queued` $\rightarrow$ `building` $\rightarrow$ `running` on an alternate worker.
- **Judge Pitch Highlight:** *"Watch us crash an active worker node right now in front of you. The 30-second sweeper detects the dropped heartbeat and seamlessly revives the workload on another peer machine."*

---

## 9. Multi-Replica Distribution Matrix & Ingress Topology

### 9.1 Technical Architecture Level
- **Core Files:** [`apps/web/src/components/deployments/ReplicaTopologyView.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/components/deployments/ReplicaTopologyView.tsx).
- **Topology Resolution:**
  - Evaluates all active deployments matching an application slug across the worker fleet.
  - Maps worker node IP addresses (`100.x.y.z`), hostnames, assigned ephemeral ports, and container IDs.
  - Visualizes edge gateway traffic distribution from Cloudflare tunnel $\rightarrow$ Caddy reverse proxy $\rightarrow$ individual peer replica endpoints.

### 9.2 User POV & UI/UX Experience Level
- **User Goal:** Inspect how microservice instances are distributed geographically and across different physical machines.
- **Visual Components:**
  - Interactive distribution matrix showing host icons, worker names, local port bindings, and health badges.
  - Copyable gateway ingress URLs for each active replica.
- **Judge Pitch Highlight:** *"Developers can inspect their multi-replica topologies at a glance, verifying that replicas are distributed across different physical workstations for fault tolerance."*

---

## 10. Distributed Worker Fleet Explorer & Telemetry Inspector

### 10.1 Technical Architecture Level
- **Core Files:** [`apps/web/src/pages/WorkersPage.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/pages/WorkersPage.tsx), [`apps/api/src/routes/workers.ts`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/api/src/routes/workers.ts), [`apps/worker/src/services/metrics.ts`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/worker/src/services/metrics.ts).
- **Telemetry Collection:**
  - Worker host agent polls Node.js `os` APIs: `os.cpus()`, `os.freemem()`, `os.totalmem()`, `os.loadavg()`.
  - Calculates instantaneous CPU utilization delta across core tick measurements.
  - Sends authenticated telemetry in 10-second heartbeat payloads to the Control Plane.

### 10.2 User POV & UI/UX Experience Level
- **User Goal:** Monitor all connected laptops and desktop machines in the organization's compute mesh.
- **Visual Features:**
  - Table of all nodes with state badges (`idle`, `busy`, `draining`, `offline`).
  - CPU usage progress bar, memory utilization bar (e.g. `4.2 GB / 16.0 GB`), active container slots (e.g. `2 / 4`), and last heartbeat elapsed time (e.g. `4s ago`).
- **Judge Pitch Highlight:** *"Complete cluster visibility: see every developer's machine, their operating system, and how much compute headroom is available across the fleet."*

---

## 11. Developer Workstation Onboarding Wizard

### 11.1 Technical Architecture Level
- **Core Files:** [`apps/web/src/pages/ContributeLaptopPage.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/pages/ContributeLaptopPage.tsx), [`deploy/setup-tailscale.sh`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/deploy/setup-tailscale.sh), [`deploy/setup-tailscale.ps1`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/deploy/setup-tailscale.ps1).
- **Validation Engine:** Validates that the developer's provided IP is a valid Tailscale IPv4 address in the carrier-grade private network range `100.64.0.0/10`.
- **Command Synthesis:** Generates pre-configured terminal commands for Git cloning, environment variable configuration, and background worker startup.

### 11.2 User POV & UI/UX Experience Level
- **User Goal:** Step-by-step guidance for a developer joining the hackathon team to contribute their own laptop to the compute cluster in under 3 minutes.
- **5-Step Guided Journey:**
  1. *Overview:* Explains terms and privacy boundaries (Docker isolation, host safety).
  2. *Prerequisites:* Checklist for Docker, Node.js 20+, pnpm, and Tailscale.
  3. *Clone Project:* One-click copy button for `git clone` commands.
  4. *Start Agent:* Command to copy `.env` and run `pnpm dev:worker`.
  5. *Verify Network:* Input field to validate Tailscale IP address and test connectivity.
- **Judge Pitch Highlight:** *"Onboarding new compute is completely self-serve. Any developer on the team can run a 2-line terminal command and their machine instantly joins the compute mesh."*

---

## 12. Personal Contributor Node Dashboard

### 12.1 Technical Architecture Level
- **Core Files:** [`apps/web/src/pages/MyWorkerPage.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/pages/MyWorkerPage.tsx).
- **Local Node Isolation:** Reads local contributor configuration (`localStorage` or local worker client) to display host-specific allocation, container slots, and sample peer earnings.

### 12.2 User POV & UI/UX Experience Level
- **User Goal:** A personalized view for the laptop owner to monitor their own machine, pause container scheduling when they need full CPU for gaming/compiling, or remove their node.
- **Controls & Features:**
  - Quick **Pause Demo Node / Resume** toggle.
  - Resource usage cards for CPU, Memory, Storage, and Container slots.
  - Sample community contribution balance ($12.40 sample earnings display).
- **Judge Pitch Highlight:** *"The contributor stays in full control: they can pause container scheduling with one click whenever they need their computer's full power for local tasks."*

---

## 13. Real-Time Terminal Log Streaming & Live Inspector

### 13.1 Technical Architecture Level
- **Core Files:** [`apps/web/src/components/deployments/DeploymentLogsModal.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/components/deployments/DeploymentLogsModal.tsx), [`apps/web/src/pages/LogsPage.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/pages/LogsPage.tsx), [`apps/api/src/routes/deployments.ts`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/api/src/routes/deployments.ts).
- **Ingestion & Streaming:**
  - Worker streams Docker build and runtime stdout/stderr chunks via `POST /api/v1/internal/deployments/:id/logs`.
  - Control plane persists chunks in `deployment_logs` table (and memory store in dev mode).
  - Web client polls every 2000ms with auto-scrolling terminal window.
  - Sanitization prevents ANSI terminal injection.

### 13.2 User POV & UI/UX Experience Level
- **User Goal:** Inspect live Docker build logs, container startup outputs, and runtime errors directly in the web browser.
- **Visual Features:**
  - Dark terminal theme with Geist Mono font.
  - Stream filtering toggles: `stdout`, `stderr`, and `system`.
  - Search filter input to find specific error messages.
  - Auto-scroll lock toggle and Copy All Logs button.
- **Judge Pitch Highlight:** *"Full developer observability: view live streaming build logs, Docker container startup output, and errors directly in the dashboard."*

---

## 14. Deep Cluster Analytics & Saturation Forecasting

### 14.1 Technical Architecture Level
- **Core Files:** [`apps/web/src/pages/AnalyticsPage.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/pages/AnalyticsPage.tsx).
- **Data Visualization Engine:** Utilizes Recharts with `ResponsiveContainer`, `AreaChart`, and `BarChart` components rendering time-series cluster saturation, memory allocation distributions, and simulated scheduler curves.

### 14.2 User POV & UI/UX Experience Level
- **User Goal:** Analyze historical cluster utilization and evaluate how future container deployments will affect overall cluster headroom.
- **Visual Charts:**
  - Time-series cluster memory and CPU saturation area charts.
  - Workload distribution bar charts across physical nodes.
  - Interactive parameter sliders allowing operators to model hypothetical cluster load spikes.
- **Judge Pitch Highlight:** *"Enterprise-ready telemetry: track memory saturation curves and forecast cluster capacity before scaling up production workloads."*

---

## 15. System Settings, Token & Environment Management

### 15.1 Technical Architecture Level
- **Core Files:** [`apps/web/src/pages/SettingsPage.tsx`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/pages/SettingsPage.tsx), [`apps/api/src/config/env.ts`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/api/src/config/env.ts).
- **Configuration Management:** Validates Control Plane API connectivity, displays backend environment status (`development` / `production`), manages local admin session tokens, and validates Tailscale auth key availability.

### 15.2 User POV & UI/UX Experience Level
- **User Goal:** Configure connection parameters, toggle light/dark theme, verify database and Redis health, and update API authentication tokens.
- **Visual Features:**
  - Connection health card showing API URL, latency, and status.
  - Theme switcher (Dark / Light / System mode).
  - Masked token inputs with reveal toggles.
- **Judge Pitch Highlight:** *"Clean administrative controls to manage security tokens, verify backend health, and adjust platform settings."*

---

## 16. Resilient Dual-Tier Zero-Red-Screen Fallback System

### 16.1 Technical Architecture Level
- **Core Files:** [`apps/web/src/services/api.ts`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/web/src/services/api.ts), [`apps/api/src/db/memory-store.ts`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/api/src/db/memory-store.ts), [`apps/api/src/db/index.ts`](file:///c:/Users/ReniCd/Desktop/Hackathons/BNB_FINAL_2026/apps/api/src/db/index.ts).
- **Two-Tier Resiliency Architecture:**
  1. **Tier 1 (Backend Database Fallback):** `apps/api` checks `isDatabaseAvailable()`. If PostgreSQL is offline or restarting, all controllers seamlessly route queries through `memoryStore` with identical data structures and zero HTTP 500 crashes.
  2. **Tier 2 (Frontend Client Fallback):** If `apps/api` is completely offline or in standalone demo mode, `apps/web/src/services/api.ts` intercepts network exceptions and calculates state, scheduler placements, FinOps summaries, and deployments directly in the browser using `localStorage`.

### 16.2 User POV & UI/UX Experience Level
- **User Goal:** Zero red error banners, zero broken screens, and uninterrupted presentation flow during live hackathon judging, regardless of network connectivity or infrastructure glitches.
- **Visual Experience:**
  - The UI remains completely responsive, fluid, and functional at all times.
  - Health indicators gracefully display current connection state without blocking user workflows.
- **Judge Pitch Highlight:** *"Engineered with carrier-grade resilience: even if the central database or network drops during a live presentation, our two-tier fallback guarantees zero red error screens."*
