import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
} from 'lucide-react';
import { WorkerNode } from '@cloud-without-clouds/shared';
import { api, WorkerScoreBreakdown, SweepResult } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DataError } from '@/components/ui/data-error';

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

  const {
    data: workers = [],
    isLoading,
    isError: isWorkersError,
    error: workersError,
    refetch: refetchWorkers,
  } = useQuery<WorkerNode[]>({
    queryKey: ['workers'],
    queryFn: () => api.getWorkers(),
    refetchInterval: 5000,
  });

  const { data: scores = [], isError: isScoresError, error: scoresError } = useQuery<WorkerScoreBreakdown[]>({
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
      {/* Header with Sweeper Action */}
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

        {/* Health Sweeper Action */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => sweepMutation.mutate()}
            disabled={sweepMutation.isPending}
            className="h-8.5 text-xs flex items-center gap-1.5"
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

      {isWorkersError ? (
        <DataError error={workersError} onRetry={() => void refetchWorkers()} />
      ) : isScoresError ? (
        <DataError title="Unable to load scheduler scores" error={scoresError} />
      ) : null}

      {sweepMutation.isError && (
        <DataError title="Cluster sweep failed" error={sweepMutation.error} />
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
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
              Phase 6 Target Architecture
            </span>
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

      {/* Worker Node Cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Card key={i} className="p-5">
              <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-5 w-16" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            </Card>
          ))}
        </div>
      ) : isWorkersError ? null : workers.length === 0 ? (
        <Card className="border border-dashed border-border p-10 text-center">
          <div className="max-w-sm mx-auto space-y-3">
            <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center mx-auto">
              <Server className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No Workers Registered</p>
            <p className="text-xs text-muted-foreground">
              Run{' '}
              <code className="font-mono bg-secondary px-1.5 py-0.5 rounded text-foreground">
                pnpm dev:worker
              </code>{' '}
              on a workstation to link it across the Tailscale mesh.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {workers.map((worker) => {
            const memUsedPct = worker.resources
              ? Math.round(
                  (worker.resources.usedMemoryMb / Math.max(worker.resources.totalMemoryMb, 1)) * 100
                )
              : 0;
            const lastSeen = new Date(worker.lastHeartbeatAt);
            const secondsAgo = Math.max(0, Math.round((Date.now() - lastSeen.getTime()) / 1000));
            const isFresh = secondsAgo < 15;
            const isWarning = secondsAgo >= 15 && secondsAgo < 30;
            const leaseStatus =
              worker.state !== 'offline' && secondsAgo < 30 ? 'active' : 'expired';

            const scoreInfo = getScoreForWorker(worker.id);

            return (
              <Card key={worker.id} className="overflow-hidden hover:border-foreground/20 transition-all">
                <CardHeader className="p-5 pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-sm font-bold text-foreground">
                          {worker.name}
                        </CardTitle>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                          {worker.id}
                        </span>
                        {scoreInfo && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                            <ShieldCheck className="h-3 w-3" />
                            Load Score S(W): {scoreInfo.score.toFixed(4)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono flex-wrap">
                        <span>{worker.hostname}</span>
                        <span>•</span>
                        <span>
                          {worker.ipAddress}:{worker.port}
                        </span>
                        <span>•</span>
                        <span>agent v{worker.version}</span>
                      </div>
                    </div>
                    <WorkerStatusBadge state={worker.state} />
                  </div>
                </CardHeader>

                <CardContent className="px-5 pb-5 space-y-4">
                  {/* Hardware Telemetry Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium text-muted-foreground font-mono">
                        <Cpu className="h-3 w-3" />
                        CPU Usage
                      </div>
                      <UsageBar value={worker.resources?.cpuUsagePercent ?? 0} />
                      <p className="text-[11px] text-muted-foreground">
                        {worker.resources?.cpuCount} host cores
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
                        Heartbeat lease: {leaseStatus}
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
