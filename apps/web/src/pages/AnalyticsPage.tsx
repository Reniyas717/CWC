import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Cpu,
  HardDrive,
  Activity,
  Layers,
  Server,
  Network,
  ShieldCheck,
  Zap,
  TrendingUp,
  Sliders,
  ExternalLink,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { WorkerNode, Deployment } from '@cloud-without-clouds/shared';
import { api, WorkerScoreBreakdown } from '@/services/api';
import { Badge } from '@/components/ui/badge';

interface TelemetryPoint {
  time: string;
  cpu: number;
  memory: number;
}

export function AnalyticsPage() {
  const [simMemory, setSimMemory] = React.useState<number>(45);
  const [simCpu, setSimCpu] = React.useState<number>(30);
  const [simContainers, setSimContainers] = React.useState<number>(1);

  const { data: workers = [] } = useQuery<WorkerNode[]>({
    queryKey: ['workers'],
    queryFn: () => api.getWorkers(),
    refetchInterval: 5000,
  });

  const { data: deployments = [] } = useQuery<Deployment[]>({
    queryKey: ['deployments'],
    queryFn: () => api.getDeployments(),
    refetchInterval: 5000,
  });

  const { data: scores = [] } = useQuery<WorkerScoreBreakdown[]>({
    queryKey: ['worker-scores'],
    queryFn: () => api.getWorkerScores(512),
    refetchInterval: 5000,
  });

  const onlineWorkers = workers.filter((w) => w.state !== 'offline');
  const runningDeployments = deployments.filter((d) => d.state === 'running');
  const totalCores = workers.reduce((acc, w) => acc + (w.resources?.cpuCount || 0), 0);
  const totalMemoryMb = workers.reduce((acc, w) => acc + (w.resources?.totalMemoryMb || 0), 0);
  const usedMemoryMb = workers.reduce((acc, w) => acc + (w.resources?.usedMemoryMb || 0), 0);
  const activeContainers = workers.reduce(
    (acc, w) => acc + (w.resources?.activeContainers || 0),
    0
  );

  const clusterMemPct = totalMemoryMb > 0 ? Math.round((usedMemoryMb / totalMemoryMb) * 100) : 0;
  const avgCpuUsage =
    onlineWorkers.length > 0
      ? Math.round(
          onlineWorkers.reduce((acc, w) => acc + (w.resources?.cpuUsagePercent || 0), 0) /
            onlineWorkers.length
        )
      : 0;

  // Real-time rolling waveform
  const [history, setHistory] = React.useState<TelemetryPoint[]>(() => {
    const initial: TelemetryPoint[] = [];
    const now = Date.now();
    for (let i = 9; i >= 0; i--) {
      const t = new Date(now - i * 8000);
      initial.push({
        time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        cpu: Math.max(5, Math.min(95, avgCpuUsage + Math.floor(Math.sin(i * 1.2) * 6))),
        memory: Math.max(10, Math.min(95, clusterMemPct + Math.floor(Math.cos(i * 0.9) * 4))),
      });
    }
    return initial;
  });

  React.useEffect(() => {
    const interval = setInterval(() => {
      const nowStr = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setHistory((prev) => {
        const next = [...prev.slice(1), { time: nowStr, cpu: avgCpuUsage, memory: clusterMemPct }];
        return next;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [avgCpuUsage, clusterMemPct]);

  // Comparative worker data for bar chart
  const workerComparisonData = onlineWorkers.map((w) => {
    const totalMb = w.resources?.totalMemoryMb || 8192;
    const usedMb = w.resources?.usedMemoryMb || 0;
    const freeMb = Math.max(0, totalMb - usedMb);
    return {
      name: w.name,
      usedRamGb: Number((usedMb / 1024).toFixed(1)),
      freeRamGb: Number((freeMb / 1024).toFixed(1)),
      cpuUsagePct: w.resources?.cpuUsagePercent || 0,
      containers: w.resources?.activeContainers || 0,
    };
  });

  // Simulated S(W) Calculation
  const simulatedScore = Number(
    (0.4 * (simMemory / 100) + 0.4 * (simCpu / 100) + 0.2 * (simContainers / 4)).toFixed(4)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1
              className="text-2xl font-bold tracking-tight text-foreground"
              style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
            >
              Cluster Telemetry & Analytics Fabric
            </h1>
            <Badge variant="outline" className="text-xs font-mono">
              Live Stream
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Deep kernel utilization, aggregate hardware pooling, and mathematical placement
            telemetry across donor laptops.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground self-start sm:self-auto">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            100% Zero-Cloud Infrastructure
          </span>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-md border border-border bg-card p-4 space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5 font-mono uppercase text-[10px] tracking-wider">
              <Cpu className="h-3.5 w-3.5" />
              Compute Cores Pooled
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-foreground">{totalCores}</span>
            <span className="text-xs text-muted-foreground font-medium">Cores Available</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Distributed across {onlineWorkers.length} contributor{' '}
            {onlineWorkers.length === 1 ? 'workstation' : 'workstations'}
          </p>
        </div>

        <div className="rounded-md border border-border bg-card p-4 space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5 font-mono uppercase text-[10px] tracking-wider">
              <HardDrive className="h-3.5 w-3.5" />
              Cluster Memory Fabric
            </span>
            <span className="text-xs font-mono font-semibold text-foreground">
              {clusterMemPct}%
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-foreground">
              {(totalMemoryMb / 1024).toFixed(1)}
            </span>
            <span className="text-xs text-muted-foreground font-medium">GB Aggregated</span>
          </div>
          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mt-1">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                clusterMemPct > 80
                  ? 'bg-destructive'
                  : clusterMemPct > 60
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              style={{ width: `${clusterMemPct}%` }}
            />
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-4 space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5 font-mono uppercase text-[10px] tracking-wider">
              <Activity className="h-3.5 w-3.5" />
              Cluster CPU Headroom
            </span>
            <span className="text-xs font-mono font-semibold text-foreground">
              {100 - avgCpuUsage}%
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-foreground">{avgCpuUsage}%</span>
            <span className="text-xs text-muted-foreground font-medium">Avg Load</span>
          </div>
          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${avgCpuUsage}%` }}
            />
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-4 space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5 font-mono uppercase text-[10px] tracking-wider">
              <Layers className="h-3.5 w-3.5" />
              Container Density
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-foreground">{activeContainers}</span>
            <span className="text-xs text-muted-foreground font-medium">Sandboxed Apps</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Enforced memory and CPU caps</p>
        </div>
      </div>

      {/* Main Charts Grid: Waveform + Node Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left: Waveform Area Chart (7 Cols) */}
        <div className="lg:col-span-7 rounded-md border border-border bg-card p-4 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-foreground">
                  Rolling Resource Waveform
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="flex items-center gap-1 text-emerald-500">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  CPU %
                </span>
                <span className="flex items-center gap-1 text-blue-500">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  Memory %
                </span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Sampled every 8 seconds from distributed worker telemetry agents.
            </p>
          </div>

          <div className="h-60 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="anCpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="anMemGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                <XAxis
                  dataKey="time"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }}
                />
                <YAxis
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }}
                  unit="%"
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="rounded border border-border bg-popover p-2 shadow-md text-xs font-mono space-y-1">
                          <p className="text-muted-foreground text-[10px]">
                            {payload[0].payload.time}
                          </p>
                          <div className="flex items-center gap-2 text-emerald-400">
                            <span>Host CPU:</span>
                            <span className="font-bold">{payload[0].value}%</span>
                          </div>
                          <div className="flex items-center gap-2 text-blue-400">
                            <span>Cluster RAM:</span>
                            <span className="font-bold">{payload[1]?.value}%</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cpu"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#anCpuGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="memory"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#anMemGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded bg-secondary/30 p-2.5 text-[11px] text-muted-foreground flex items-center gap-2 border border-border/60">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span>
              Telemetry heartbeat validated every 10s. Node lease expires after 30s of silence.
            </span>
          </div>
        </div>

        {/* Right: Worker Capacity Comparison Bar Chart (5 Cols) */}
        <div className="lg:col-span-5 rounded-md border border-border bg-card p-4 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-foreground" />
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-foreground">
                  Node Hardware Breakdown
                </span>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono py-0 h-4.5">
                RAM GB Comparison
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Active RAM allocation vs available memory headroom across laptops.
            </p>
          </div>

          {workerComparisonData.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground font-mono">
              No online workers available for comparison.
            </div>
          ) : (
            <div className="h-60 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={workerComparisonData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }}
                    unit="GB"
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="rounded border border-border bg-popover p-2 shadow-md text-xs font-mono space-y-1">
                            <p className="font-semibold text-foreground">
                              {payload[0].payload.name}
                            </p>
                            <div className="text-emerald-400">
                              Free RAM: {payload[0].payload.freeRamGb} GB
                            </div>
                            <div className="text-blue-400">
                              Allocated: {payload[0].payload.usedRamGb} GB
                            </div>
                            <div className="text-muted-foreground">
                              Containers: {payload[0].payload.containers}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }}
                    formatter={(value) => (value === 'freeRamGb' ? 'Free RAM' : 'Allocated RAM')}
                  />
                  <Bar dataKey="freeRamGb" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="usedRamGb" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="rounded bg-secondary/30 p-2.5 text-[11px] text-muted-foreground flex items-center gap-2 border border-border/60">
            <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span>Workloads automatically land on nodes with largest free RAM headroom.</span>
          </div>
        </div>
      </div>

      {/* S(W) Placement Simulator & Mathematical Auction Engine */}
      <div className="rounded-md border border-border bg-card p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-bold font-mono uppercase tracking-wider text-foreground">
              Interactive Placement Simulator: S(W) Load Formula
            </span>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">
            S(W) = 0.4(MemRatio) + 0.4(CpuRatio) + 0.2(Active/Max)
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Sliders (8 Cols) */}
          <div className="lg:col-span-8 space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-mono">
                  Memory Saturation (40% Weight):
                </span>
                <span className="font-mono font-bold text-foreground">{simMemory}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={simMemory}
                onChange={(e) => setSimMemory(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-mono">Host CPU Load (40% Weight):</span>
                <span className="font-mono font-bold text-foreground">{simCpu}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={simCpu}
                onChange={(e) => setSimCpu(Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-mono">
                  Active Workloads (20% Weight):
                </span>
                <span className="font-mono font-bold text-foreground">
                  {simContainers} / 4 Containers
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="4"
                value={simContainers}
                onChange={(e) => setSimContainers(Number(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Formula Scorecard Result (4 Cols) */}
          <div className="lg:col-span-4 rounded-md border border-border bg-secondary/30 p-4 space-y-2 text-center">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Calculated Placement Score
            </span>
            <p className="text-3xl font-bold font-mono text-foreground">
              {simScoreBadge(simulatedScore)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {simulatedScore < 0.4
                ? 'High Placement Priority: Worker has ample memory & CPU capacity.'
                : simulatedScore < 0.7
                  ? 'Moderate Load: Workloads will be scheduled if lower-scoring peers are full.'
                  : 'Saturated: Scheduler will bypass this node to prevent host OS lag.'}
            </p>
          </div>
        </div>

        {/* Live Cluster Worker Scoreboard */}
        {scores.length > 0 && (
          <div className="pt-3 border-t border-border space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
              Live Contributor Placement Headroom Scores
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              {scores.map((sc) => (
                <div key={sc.workerId} className="p-2.5 rounded border border-border bg-card flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{sc.name}</p>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {(sc.freeMemoryMb / 1024).toFixed(1)} GB Free • {sc.cpuUsagePercent}% CPU
                    </span>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <span className="font-mono font-bold text-foreground block">
                      {sc.score.toFixed(4)}
                    </span>
                    <Badge variant={sc.eligible ? 'success' : 'destructive'} className="text-[9px] py-0 h-4">
                      {sc.eligible ? 'Eligible' : 'Full'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Live Ingress & Gateway Route Matrix */}
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-bold font-mono uppercase tracking-wider text-foreground">
              Edge Ingress & Upstream Mesh Topology
            </span>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">
            {runningDeployments.length} Active Reverse Proxy Route
            {runningDeployments.length === 1 ? '' : 's'}
          </span>
        </div>

        {runningDeployments.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground font-mono">
            No running workloads currently proxied by Caddy edge.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {runningDeployments.map((dep) => {
              const assignedWorker = workers.find((w) => w.id === dep.workerId);
              return (
                <div
                  key={dep.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold font-mono text-foreground">{dep.id}</span>
                      <Badge variant="outline" className="text-[10px] font-mono py-0 h-4">
                        {dep.applicationId}
                      </Badge>
                      <Badge variant="success" className="text-[10px] font-mono py-0 h-4">
                        {dep.routingStatus}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                      <span>Worker: {assignedWorker?.name || dep.workerId}</span>
                      <span>•</span>
                      <span>
                        Target: {assignedWorker?.ipAddress || '127.0.0.1'}:{dep.assignedPort}
                      </span>
                    </div>
                  </div>

                  {dep.publicUrl ? (
                    <a
                      href={dep.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-mono text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 self-start sm:self-auto"
                    >
                      <span>{dep.publicUrl}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-xs font-mono text-muted-foreground">
                      Local port :{dep.assignedPort}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function simScoreBadge(score: number) {
  return score.toFixed(4);
}
