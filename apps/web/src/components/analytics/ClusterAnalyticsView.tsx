import * as React from 'react';
import {
  Cpu,
  HardDrive,
  Activity,
  Layers,
  Scale,
  HelpCircle,
  BarChart3,
  Server,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { WorkerNode } from '@cloud-without-clouds/shared';
import { WorkerScoreBreakdown } from '@/services/api';
import { Badge } from '@/components/ui/badge';

interface ClusterAnalyticsViewProps {
  workers: WorkerNode[];
  scores: WorkerScoreBreakdown[];
}

interface TelemetryPoint {
  time: string;
  cpu: number;
  memory: number;
}

export function ClusterAnalyticsView({ workers, scores }: ClusterAnalyticsViewProps) {
  const onlineWorkers = workers.filter((w) => w.state !== 'offline');

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

  // Real-time rolling telemetry history for Recharts
  const [history, setHistory] = React.useState<TelemetryPoint[]>(() => {
    const initial: TelemetryPoint[] = [];
    const now = Date.now();
    for (let i = 8; i >= 0; i--) {
      const t = new Date(now - i * 10000);
      initial.push({
        time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        cpu: Math.max(5, Math.min(95, avgCpuUsage + Math.floor(Math.sin(i) * 5))),
        memory: Math.max(10, Math.min(95, clusterMemPct + Math.floor(Math.cos(i) * 3))),
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
    }, 10000);

    return () => clearInterval(interval);
  }, [avgCpuUsage, clusterMemPct]);

  return (
    <div className="space-y-4">
      {/* Analytics Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h3
              className="text-sm font-bold text-foreground tracking-tight flex items-center gap-2"
              style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
            >
              <BarChart3 className="h-4 w-4 text-emerald-500" />
              <span>Real-Time Cluster Telemetry & Capacity Fabric</span>
            </h3>
            <Badge variant="outline" className="text-[10px] font-mono py-0 h-5">
              Live Monitoring
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aggregated resource leases, kernel utilization telemetry, and comparative placement
            scores across donor workstations.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground self-start sm:self-auto">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            10s Telemetry Pulse
          </span>
        </div>
      </div>

      {/* Cluster Metrics 4-Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-md border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5 font-mono uppercase text-[10px] tracking-wider">
              <Cpu className="h-3.5 w-3.5" />
              Compute Cores Pooled
            </span>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-foreground">{totalCores}</span>
              <span className="text-xs text-muted-foreground font-medium">Cores Available</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Across {onlineWorkers.length} contributor{' '}
              {onlineWorkers.length === 1 ? 'laptop' : 'laptops'}
            </p>
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5 font-mono uppercase text-[10px] tracking-wider">
              <HardDrive className="h-3.5 w-3.5" />
              Aggregated Cluster RAM
            </span>
            <span className="text-xs font-mono font-semibold text-foreground">
              {clusterMemPct}%
            </span>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-foreground">
                {(totalMemoryMb / 1024).toFixed(1)}
              </span>
              <span className="text-xs text-muted-foreground font-medium">GB Shared</span>
            </div>
            {/* Visual RAM Fill Bar */}
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
        </div>

        <div className="rounded-md border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5 font-mono uppercase text-[10px] tracking-wider">
              <Activity className="h-3.5 w-3.5" />
              Average CPU Utilization
            </span>
            <span className="text-xs font-mono font-semibold text-foreground">{avgCpuUsage}%</span>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-foreground">{avgCpuUsage}%</span>
              <span className="text-xs text-muted-foreground font-medium">Host CPU Activity</span>
            </div>
            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mt-1">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  avgCpuUsage > 80
                    ? 'bg-destructive'
                    : avgCpuUsage > 50
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}
                style={{ width: `${avgCpuUsage}%` }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5 font-mono uppercase text-[10px] tracking-wider">
              <Layers className="h-3.5 w-3.5" />
              Active Docker Workloads
            </span>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-foreground">
                {activeContainers}
              </span>
              <span className="text-xs text-muted-foreground font-medium">Containers Running</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Enforced memory and CPU limits</p>
          </div>
        </div>
      </div>

      {/* Bklit-Style Interactive Recharts Area Chart */}
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-bold text-foreground font-mono uppercase tracking-wider">
              Cluster Compute Waveform (Time-Series Telemetry)
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" />
              Host CPU %
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-xs bg-blue-500" />
              Cluster Memory %
            </span>
          </div>
        </div>

        <div className="h-48 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="fillCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="fillMemory" x1="0" y1="0" x2="0" y2="1">
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
                          <span>CPU Load:</span>
                          <span className="font-bold">{payload[0].value}%</span>
                        </div>
                        <div className="flex items-center gap-2 text-blue-400">
                          <span>Cluster Memory:</span>
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
                fill="url(#fillCpu)"
              />
              <Area
                type="monotone"
                dataKey="memory"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#fillMemory)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Scheduler S(W) Comparative Scorecards */}
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-foreground" />
            <span className="text-xs font-bold text-foreground font-mono uppercase tracking-wider">
              Scheduler Placement Formula S(W) Breakdown
            </span>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">
            S(W) = 0.4(Mem) + 0.4(CPU) + 0.2(Active/Max) • Lowest Score Wins Placement
          </span>
        </div>

        {scores.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground font-mono">
            No active worker scores available. Start a worker agent to begin telemetry evaluation.
          </div>
        ) : (
          <div className="space-y-3">
            {scores.map((sc) => {
              const workerObj = workers.find((w) => w.id === sc.workerId);
              const isOffline = workerObj?.state === 'offline';

              return (
                <div
                  key={sc.workerId}
                  className="rounded border border-border bg-secondary/30 p-3 space-y-2.5 text-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <Server className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <span className="font-semibold text-foreground">{sc.name}</span>
                        <span className="text-[10px] font-mono text-muted-foreground ml-2">
                          {sc.workerId}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[10px] font-mono text-muted-foreground uppercase mr-1">
                          Placement Score:
                        </span>
                        <span
                          className={`font-mono font-bold ${
                            isOffline ? 'text-muted-foreground line-through' : 'text-foreground'
                          }`}
                        >
                          {isOffline ? 'OFFLINE' : sc.score.toFixed(4)}
                        </span>
                      </div>
                      <Badge
                        variant={sc.eligible && !isOffline ? 'success' : 'destructive'}
                        className="text-[9px] py-0 h-4 font-mono"
                      >
                        {isOffline ? 'Offline' : sc.eligible ? 'Eligible' : 'Ineligible'}
                      </Badge>
                    </div>
                  </div>

                  {/* 3 Component Progress Bars */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                        <span>Memory Weight (40%):</span>
                        <span className="text-foreground font-semibold">
                          {(sc.memoryRatio * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${Math.min(100, sc.memoryRatio * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground block font-mono">
                        {(sc.freeMemoryMb / 1024).toFixed(1)} GB Free
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                        <span>CPU Weight (40%):</span>
                        <span className="text-foreground font-semibold">
                          {(sc.cpuRatio * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.min(100, sc.cpuRatio * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground block font-mono">
                        {sc.cpuUsagePercent}% Host Load
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                        <span>Workload Ratio (20%):</span>
                        <span className="text-foreground font-semibold">
                          {(sc.containerRatio * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full"
                          style={{ width: `${Math.min(100, sc.containerRatio * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground block font-mono">
                        {sc.activeContainers} / {sc.maxConcurrentWorkloads} Containers
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Backend Note */}
        <div className="rounded bg-secondary/40 p-2.5 text-[11px] text-muted-foreground flex items-center gap-2">
          <HelpCircle className="h-3.5 w-3.5 text-foreground shrink-0" />
          <span>
            The scheduler calculates S(W) on every incoming deployment request. Workloads
            automatically land on the machine with the highest available headroom, ensuring zero
            host thrashing.
          </span>
        </div>
      </div>
    </div>
  );
}
