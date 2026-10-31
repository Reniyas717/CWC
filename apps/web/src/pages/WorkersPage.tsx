import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import {
  Cpu,
  HardDrive,
  Wifi,
  WifiOff,
  Activity,
  Server,
  Clock,
  Container,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  SlidersHorizontal,
  Scale,
  ArrowRight,
} from 'lucide-react';
import { WorkerNode } from '@cloud-without-clouds/shared';
import { api, WorkerScoreBreakdown, SweepResult } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

function WorkerStatusBadge({ state }: { state: WorkerNode['state'] }) {
  if (state === 'idle') {
    return (
      <Badge variant="success" className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Idle (Ready)
      </Badge>
    );
  }
  if (state === 'busy') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
        <Activity className="h-3 w-3 animate-pulse" />
        Busy (Active)
      </span>
    );
  }
  if (state === 'offline') {
    return (
      <Badge variant="destructive" className="flex items-center gap-1.5">
        <WifiOff className="h-3 w-3" />
        Offline
      </Badge>
    );
  }
  return <Badge variant="secondary">{state}</Badge>;
}

function UsageBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  const color =
    pct > 80 ? 'bg-destructive' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-7 text-right">{pct}%</span>
    </div>
  );
}

export function WorkersPage() {
  const queryClient = useQueryClient();
  const [sweepFeedback, setSweepFeedback] = React.useState<SweepResult | null>(null);

  const { data: workers = [], isLoading } = useQuery<WorkerNode[]>({
    queryKey: ['workers'],
    queryFn: () => api.getWorkers(),
    refetchInterval: 5000,
  });

  const { data: scores = [] } = useQuery<WorkerScoreBreakdown[]>({
    queryKey: ['worker-scores'],
    queryFn: () => api.getWorkerScores(512),
    refetchInterval: 5000,
  });

  const sweepMutation = useMutation({
    mutationFn: () => api.sweepWorkers(),
    onSuccess: (result) => {
      setSweepFeedback(result);
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      queryClient.invalidateQueries({ queryKey: ['worker-scores'] });
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      setTimeout(() => setSweepFeedback(null), 5000);
    },
  });

  const onlineCount = workers.filter((w) => w.state !== 'offline').length;
  const totalContainers = workers.reduce(
    (sum, w) => sum + (w.resources?.activeContainers ?? 0),
    0
  );
  const totalCores = workers.reduce((sum, w) => sum + (w.resources?.cpuCount ?? 0), 0);
  const totalRamGb = (
    workers.reduce((sum, w) => sum + (w.resources?.totalMemoryMb ?? 0), 0) / 1024
  ).toFixed(0);

  const getScoreForWorker = (workerId: string): WorkerScoreBreakdown | undefined => {
    return scores.find((s) => s.workerId === workerId);
  };

  return (
    <div className="space-y-8">
      {/* Header with Sweeper & Equalizer Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1
            className="text-2xl font-bold tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
          >
            Worker Nodes
          </h1>
          <p className="text-sm text-muted-foreground">
            Distributed workstations contributing CPU cores, memory leases, and Docker container execution.
          </p>
        </div>

        {/* Equalizer & Health Sweeper Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <NavLink to="/equalizer">
            <Button
              size="sm"
              className="h-8.5 text-xs flex items-center gap-1.5 font-semibold cursor-pointer"
            >
              <Scale className="h-3.5 w-3.5" />
              <span>Cluster Equalizer</span>
            </Button>
          </NavLink>
          <Button
            variant="outline"
            size="sm"
            onClick={() => sweepMutation.mutate()}
            disabled={sweepMutation.isPending}
            className="h-8.5 text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${sweepMutation.isPending ? 'animate-spin' : ''}`} />
            <span>{sweepMutation.isPending ? 'Sweeping...' : 'Run Cluster Sweep'}</span>
          </Button>
        </div>
      </div>

      {/* Sweeper Feedback Banner */}
      {sweepFeedback && (
        <div className="p-3 bg-secondary/60 border border-border rounded-lg text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span className="text-foreground">
              Cluster health sweep executed: {sweepFeedback.offlineWorkers.length} offline nodes detected,{' '}
              {sweepFeedback.rescheduledDeployments.length} deployments rescheduled.
            </span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">
            {new Date(sweepFeedback.timestamp).toLocaleTimeString()}
          </span>
        </div>
      )}

      {/* Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Nodes Online', value: `${onlineCount} / ${workers.length}`, icon: Wifi },
          { label: 'Active Containers', value: String(totalContainers), icon: Container },
          { label: 'Total Compute Cores', value: `${totalCores} Cores`, icon: Cpu },
          { label: 'Aggregated RAM', value: `${totalRamGb} GB`, icon: HardDrive },
        ].map((m) => {
          const Icon = m.icon;
          return (
            <Card key={m.label}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <p className="text-xs font-medium text-muted-foreground">{m.label}</p>
                  <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center shrink-0">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
                <span className="text-2xl font-bold text-foreground tracking-tight">{m.value}</span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Scheduler Engine Overview Card */}
      <Card className="bg-secondary/15">
        <CardHeader className="p-5 pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-xs font-semibold flex items-center gap-2 text-foreground uppercase tracking-wider font-mono">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              Scheduler Placement Formula S(W)
            </CardTitle>
            <NavLink
              to="/equalizer"
              className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
            >
              <span>Launch Resource Equalizer</span>
              <ArrowRight className="h-3 w-3" />
            </NavLink>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 text-xs text-muted-foreground space-y-2">
          <p className="leading-relaxed">
            The control plane evaluates eligible worker nodes using:
            <code className="font-mono text-foreground bg-secondary px-2 py-0.5 rounded mx-1 text-[11px]">
              S(W) = 0.4(MemRatio) + 0.4(CpuRatio) + 0.2(ActiveContainers / MaxLimit)
            </code>
            Nodes with the lowest load score $S(W)$ are selected for upcoming workload placements.
          </p>
        </CardContent>
      </Card>

      {/* Worker List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-5 w-48 mb-3" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-10 w-full" />
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : workers.length === 0 ? (
        <Card className="p-12 text-center">
          <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-base font-semibold text-foreground mb-1">No Worker Nodes Found</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            Start a worker node on your workstation using `pnpm dev:worker` to register it with the control plane.
          </p>
          <div className="inline-block p-3 bg-secondary rounded-md font-mono text-xs text-left">
            $ pnpm --filter @cloud-without-clouds/worker dev
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {workers.map((worker) => {
            const scoreInfo = getScoreForWorker(worker.id);
            const memUsedPct = worker.resources
              ? (worker.resources.usedMemoryMb / Math.max(worker.resources.totalMemoryMb, 1)) * 100
              : 0;
            const lastHeartbeat = new Date(worker.lastHeartbeatAt).getTime();
            const secondsAgo = Math.floor((Date.now() - lastHeartbeat) / 1000);
            const isFresh = secondsAgo < 15 && worker.state !== 'offline';
            const isWarning = secondsAgo >= 15 && secondsAgo < 30 && worker.state !== 'offline';

            return (
              <Card key={worker.id} className="transition-all hover:border-foreground/20">
                <CardContent className="p-5 space-y-4">
                  {/* Top Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
                        <Server className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground text-sm">{worker.name}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-muted-foreground">
                            {worker.hostname}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-muted-foreground">
                            {worker.ipAddress}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{worker.id}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      {scoreInfo && (
                        <div className="text-right mr-2 hidden sm:block">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
                            Placement S(W)
                          </span>
                          <span className="font-mono text-xs font-bold text-foreground">
                            {scoreInfo.score.toFixed(4)}
                          </span>
                        </div>
                      )}
                      <WorkerStatusBadge state={worker.state} />
                    </div>
                  </div>

                  {/* Telemetry Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium text-muted-foreground font-mono">
                        <Cpu className="h-3 w-3" />
                        CPU Core Usage
                      </div>
                      <UsageBar value={worker.resources?.cpuUsagePercent ?? 0} />
                      <p className="text-[11px] text-muted-foreground">
                        {worker.resources?.cpuCount ?? 0} Cores assigned
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium text-muted-foreground font-mono">
                        <HardDrive className="h-3 w-3" />
                        Memory Utilization
                      </div>
                      <UsageBar value={memUsedPct} />
                      <p className="text-[11px] text-muted-foreground">
                        {((worker.resources?.usedMemoryMb ?? 0) / 1024).toFixed(1)} /{' '}
                        {((worker.resources?.totalMemoryMb ?? 0) / 1024).toFixed(0)} GB
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium text-muted-foreground font-mono">
                        <Container className="h-3 w-3" />
                        Containers Running
                      </div>
                      <p className="text-sm font-semibold text-foreground font-mono">
                        {worker.resources?.activeContainers ?? 0}
                        <span className="text-xs font-normal text-muted-foreground ml-1">
                          / {worker.limits?.maxConcurrentWorkloads ?? 4} limit
                        </span>
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium text-muted-foreground font-mono">
                        <Clock className="h-3 w-3" />
                        Heartbeat Freshness
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            isFresh
                              ? 'bg-emerald-500 animate-pulse'
                              : isWarning
                                ? 'bg-amber-500'
                                : 'bg-destructive'
                          }`}
                        />
                        <span className="text-xs font-mono text-foreground">
                          {secondsAgo < 5 ? 'Just now' : `${secondsAgo}s ago`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Placement Eligibility Sub-Panel */}
                  {scoreInfo && (
                    <div className="pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-4 flex-wrap text-[11px] font-mono">
                        <span>Free RAM: {(scoreInfo.freeMemoryMb / 1024).toFixed(1)} GB</span>
                        <span>•</span>
                        <span>CPU Ratio: {(scoreInfo.cpuRatio * 100).toFixed(0)}%</span>
                        <span>•</span>
                        <span>
                          Placement Gate: {scoreInfo.eligible ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Eligible (Passed)</span>
                          ) : (
                            <span className="text-destructive font-semibold">Ineligible</span>
                          )}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                        Heartbeat lease: active in Redis
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
