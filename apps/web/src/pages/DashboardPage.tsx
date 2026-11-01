import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { ApiHealthIndicator } from '@/components/health/ApiHealthIndicator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Cpu,
  Layers,
  ShieldCheck,
  GitBranch,
  ArrowUpRight,
  Network,
  Package,
  Workflow,
  Plus,
  Terminal,
  ExternalLink,
  ArrowRight,
  Server,
  Activity,
  CheckCircle2,
  Scale,
  Coins,
  Zap,
  BarChart3,
} from 'lucide-react';
import { Deployment } from '@cloud-without-clouds/shared';
import { api, WorkerScoreBreakdown } from '@/services/api';
import { NewApplicationModal } from '@/components/applications/NewApplicationModal';
import { DeploymentLogsModal } from '@/components/deployments/DeploymentLogsModal';
import { FinOpsArbitrageWidget } from '@/components/finops/FinOpsArbitrageWidget';
import { AnimatedPipeline } from '@/components/deployments/AnimatedPipeline';
import { ClusterAnalyticsView } from '@/components/analytics/ClusterAnalyticsView';
import { FailoverSimulatorModal } from '@/components/chaos/FailoverSimulatorModal';
import { DataError } from '@/components/ui/data-error';

const topology = [
  {
    index: '01',
    title: 'Monorepo & Workspaces',
    body: 'pnpm + Turborepo managing apps/web, apps/api, apps/worker, and packages/shared across a single unified repository.',
    icon: Package,
  },
  {
    index: '02',
    title: 'Control Plane & Data Store',
    body: 'Express API with strict Zod validation, request logging, CORS middleware, PostgreSQL 16, and Redis 7 infrastructure.',
    icon: Workflow,
  },
  {
    index: '03',
    title: 'Distributed Worker Agent',
    body: 'Node.js worker configured for host resource telemetry, HTTP task polling, and isolated Docker container execution.',
    icon: Network,
  },
];

export function DashboardPage() {
  const [isDeployModalOpen, setIsDeployModalOpen] = React.useState(false);
  const [isChaosModalOpen, setIsChaosModalOpen] = React.useState(false);
  const [selectedLogDep, setSelectedLogDep] = React.useState<Deployment | null>(null);

  const {
    data: workers = [],
    isError: isWorkersError,
    error: workersError,
    refetch: refetchWorkers,
  } = useQuery({
    queryKey: ['workers'],
    queryFn: () => api.getWorkers(),
    refetchInterval: 5000,
  });

  const {
    data: deployments = [],
    isError: isDeploymentsError,
    error: deploymentsError,
    refetch: refetchDeployments,
  } = useQuery({
    queryKey: ['deployments'],
    queryFn: () => api.getDeployments(),
    refetchInterval: 5000,
  });

  const {
    data: scores = [],
    isError: isScoresError,
    error: scoresError,
  } = useQuery<WorkerScoreBreakdown[]>({
    queryKey: ['worker-scores'],
    queryFn: () => api.getWorkerScores(512),
    refetchInterval: 5000,
  });

  const runningCount = deployments.filter((d) => d.state === 'running').length;
  const onlineWorkers = workers.filter((w) => w.state !== 'offline').length;
  const readyRoutes = deployments.filter(
    (deployment) =>
      deployment.state === 'running' &&
      deployment.routingStatus === 'ready' &&
      typeof deployment.publicUrl === 'string' &&
      deployment.publicUrl.startsWith('https://')
  ).length;
  const ingressStatus = isDeploymentsError
    ? 'Unavailable'
    : readyRoutes > 0
      ? 'Live'
      : deployments.length === 0
        ? 'Idle'
        : 'Pending';

  const stats = [
    {
      title: 'Active Workers',
      value: String(onlineWorkers),
      unit: `${onlineWorkers} of ${workers.length} Online`,
      description: 'Distributed laptops & desktop workstations',
      icon: Cpu,
    },
    {
      title: 'Active Workloads',
      value: String(runningCount),
      unit: `${runningCount} of ${deployments.length} Running`,
      description: 'Distributed tasks with memory & CPU caps',
      icon: Layers,
    },
    {
      title: 'Scheduling Policy',
      value: 'S(W)',
      unit: 'Least-Loaded',
      description: 'Automatic placement on lowest load node',
      icon: ShieldCheck,
    },
    {
      title: 'Ingress & Gateway',
      value: ingressStatus,
      unit: `${readyRoutes} ready route${readyRoutes === 1 ? '' : 's'}`,
      description: 'Zero-cost Caddy reverse proxy & tunnels',
      icon: GitBranch,
    },
  ];

  const getScoreForWorker = (workerId: string) => {
    return scores.find((s) => s.workerId === workerId);
  };

  return (
    <div className="space-y-8">
      {/* Page Header with Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1
            className="text-2xl font-bold tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
          >
            Network Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Control plane overview, distributed worker telemetry, and workload orchestration.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <NavLink to="/finops">
            <Button
              variant="outline"
              className="h-9 px-3 text-xs font-semibold flex items-center gap-1.5 cursor-pointer text-emerald-600 dark:text-emerald-400 hover:text-emerald-700"
            >
              <Coins className="h-3.5 w-3.5" />
              <span>FinOps Arbitrage</span>
            </Button>
          </NavLink>
          <Button
            variant="outline"
            onClick={() => setIsChaosModalOpen(true)}
            className="h-9 px-3 text-xs font-semibold flex items-center gap-1.5 cursor-pointer text-destructive hover:text-destructive"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Failover Chaos Drill</span>
          </Button>
          <NavLink to="/analytics">
            <Button
              variant="outline"
              className="h-9 px-3 text-xs font-semibold flex items-center gap-1.5 cursor-pointer text-emerald-600 dark:text-emerald-400"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Deep Analytics</span>
            </Button>
          </NavLink>
          <NavLink to="/equalizer">
            <Button
              variant="outline"
              className="h-9 px-3 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Scale className="h-3.5 w-3.5" />
              <span>Load Equalizer</span>
            </Button>
          </NavLink>
          <Button
            onClick={() => setIsDeployModalOpen(true)}
            className="h-9 px-3.5 text-xs font-semibold shadow-2xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Deploy Application</span>
          </Button>
        </div>
      </div>

      {/* Backend API Health Indicator */}
      <ApiHealthIndicator />

      {/* Animated SVG Deployment Execution Pipeline */}
      <div className="rounded-md border border-border bg-card p-4 space-y-2">
        <AnimatedPipeline
          currentStage={runningCount > 0 ? 'ingress' : 'scheduler'}
          status={runningCount > 0 ? 'running' : 'idle'}
        />
      </div>

      {isWorkersError && (
        <DataError
          title="Unable to load worker telemetry"
          error={workersError}
          onRetry={() => void refetchWorkers()}
        />
      )}
      {isDeploymentsError && (
        <DataError
          title="Unable to load deployment state"
          error={deploymentsError}
          onRetry={() => void refetchDeployments()}
        />
      )}
      {isScoresError && <DataError title="Unable to load scheduler scores" error={scoresError} />}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <Card key={idx} className="group hover:border-foreground/20 transition-all">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <p className="text-xs font-medium text-muted-foreground leading-none">
                    {stat.title}
                  </p>
                  <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center shrink-0">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-2xl font-bold text-foreground tracking-tight">
                      {stat.value}
                    </span>
                    <span className="text-xs text-muted-foreground font-medium">{stat.unit}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{stat.description}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Cloud Cost Arbitrage & FinOps Dashboard Engine */}
      <FinOpsArbitrageWidget />

      {/* Real-Time Cluster Capacity & S(W) Telemetry Fabric */}
      <ClusterAnalyticsView workers={workers} scores={scores} />

      {/* Live Activity & Fleet Status Master Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Deployments Table (7 Cols) */}
        <div className="lg:col-span-7 space-y-3">
          <Card className="h-full flex flex-col justify-between">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-foreground" />
                    <span>Recent Workload Deployments</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Latest container executions scheduled across the peer network.
                  </CardDescription>
                </div>
                <NavLink
                  to="/deployments"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors font-medium"
                >
                  <span>View all</span>
                  <ArrowRight className="h-3 w-3" />
                </NavLink>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0 flex-1 flex flex-col justify-between">
              {deployments.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No active deployments. Click "Deploy Application" to begin.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {deployments.slice(0, 4).map((dep) => (
                    <div
                      key={dep.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-foreground truncate">
                            {dep.id}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-muted-foreground">
                            {dep.gitBranch}
                          </span>
                          {dep.state === 'running' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Running
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              {dep.state}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                          <span>Worker: {dep.workerId || 'pending'}</span>
                          {dep.assignedPort && <span>• Port :{dep.assignedPort}</span>}
                          {dep.routingStatus === 'ready' && dep.publicUrl && (
                            <a
                              href={dep.publicUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-foreground hover:underline inline-flex items-center gap-1"
                            >
                              <ExternalLink className="h-2.5 w-2.5" />
                              Tunnel
                            </a>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {dep.applicationId} • Node:{' '}
                          <span className="font-mono text-foreground">
                            {dep.workerId || 'pending'}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                        {dep.publicUrl && (
                          <a
                            href={dep.publicUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-primary hover:underline flex items-center gap-1 font-mono"
                          >
                            <span>Live Ingress</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLogDep(dep)}
                          className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground font-mono"
                        >
                          <Terminal className="h-3 w-3 mr-1" />
                          Logs
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Task Dispatch: HTTP Polling (2-5s)</span>
                <span className="font-mono text-[10px]">Docker Port: Ephemeral</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Distributed Compute Fleet & Real-Time Scores (5 Cols) */}
        <div className="lg:col-span-5 space-y-3">
          <Card className="h-full flex flex-col justify-between">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Server className="h-4 w-4 text-foreground" />
                    <span>Worker Compute Fleet</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Live telemetry & S(W) load scores.
                  </CardDescription>
                </div>
                <NavLink
                  to="/workers"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors font-medium"
                >
                  <span>View all</span>
                  <ArrowRight className="h-3 w-3" />
                </NavLink>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0 flex-1 flex flex-col justify-between">
              {workers.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No workers registered. Start an agent with{' '}
                  <code className="bg-secondary px-1 py-0.5 rounded">pnpm dev:worker</code>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {workers.slice(0, 3).map((w) => {
                    const score = getScoreForWorker(w.id);
                    return (
                      <div
                        key={w.id}
                        className="p-3 bg-secondary/30 rounded-md border border-border flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground truncate">{w.name}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-muted-foreground">
                              {w.ipAddress}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {w.resources?.cpuCount} Cores •{' '}
                            {((w.resources?.totalMemoryMb ?? 0) / 1024).toFixed(0)} GB RAM •{' '}
                            {w.resources?.activeContainers ?? 0} Containers
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          {score ? (
                            <div>
                              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
                                S(W)
                              </span>
                              <span className="font-mono text-xs font-bold text-foreground">
                                {score.score.toFixed(3)}
                              </span>
                            </div>
                          ) : (
                            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  Tailscale Mesh CGNAT Active
                </span>
                <span className="font-mono text-[10px]">Least-Loaded Policy</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Platform Topology */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="space-y-1">
              <CardTitle className="text-sm font-semibold">
                Platform Architecture & Subsystems
              </CardTitle>
              <CardDescription className="text-xs">
                The distributed monorepo control plane, shared types, worker telemetry agent, and
                edge ingress are active.
              </CardDescription>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20 shrink-0">
              <Activity className="h-3 w-3 text-emerald-500 animate-pulse" />
              Cluster Fabric Active
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {topology.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.index}
                  className="p-4 bg-secondary/20 rounded-md border border-border space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-md bg-secondary flex items-center justify-center shrink-0">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <span className="text-xs font-semibold text-foreground">{item.title}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{item.body}</p>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-1.5 text-[11px] text-muted-foreground pt-3 border-t border-border flex-wrap">
            <div className="flex items-center gap-1.5">
              <ArrowUpRight className="h-3 w-3 shrink-0" />
              <span>
                Phase 5 30s Heartbeat Sweeper & Phase 6 S(W) Resource Placement are integrated.
              </span>
            </div>
            <span className="font-mono text-[10px]">
              Edge: Cloudflare Quick Tunnel + Caddy Admin API (:2019)
            </span>
          </div>
        </CardContent>
      </Card>

      {/* New Application Deployment Modal */}
      <NewApplicationModal isOpen={isDeployModalOpen} onClose={() => setIsDeployModalOpen(false)} />

      {/* Terminal Log Viewer Modal */}
      <DeploymentLogsModal
        deployment={selectedLogDep}
        isOpen={!!selectedLogDep}
        onClose={() => setSelectedLogDep(null)}
      />

      {/* Failure & Recovery Chaos Simulator Modal */}
      <FailoverSimulatorModal
        isOpen={isChaosModalOpen}
        onClose={() => setIsChaosModalOpen(false)}
        workers={workers}
      />
    </div>
  );
}
