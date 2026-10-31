import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  SlidersHorizontal,
  Scale,
  ArrowLeftRight,
  RefreshCw,
  HardDrive,
  Cpu,
  Server,
  CheckCircle2,
  AlertTriangle,
  Info,
  Container,
  Layers,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { Deployment, WorkerNode } from '@cloud-without-clouds/shared';
import { api, ClusterRebalanceResult } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RelocateWorkloadModal } from '@/components/balancer/RelocateWorkloadModal';

export function EqualizerPage() {
  const queryClient = useQueryClient();
  const [selectedRelocateDep, setSelectedRelocateDep] = React.useState<Deployment | null>(null);
  const [rebalancePlan, setRebalancePlan] = React.useState<ClusterRebalanceResult | null>(null);
  const [notification, setNotification] = React.useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  // Fetch workers
  const {
    data: workers = [],
    isLoading: workersLoading,
    refetch: refetchWorkers,
  } = useQuery<WorkerNode[]>({
    queryKey: ['workers'],
    queryFn: () => api.getWorkers(),
    refetchInterval: 5000,
  });

  // Fetch deployments
  const {
    data: deployments = [],
    isLoading: depsLoading,
    refetch: refetchDeps,
  } = useQuery<Deployment[]>({
    queryKey: ['deployments'],
    queryFn: () => api.getDeployments(),
    refetchInterval: 5000,
  });

  const isLoading = workersLoading || depsLoading;

  // Active online workers
  const activeWorkers = React.useMemo(() => {
    return workers.filter((w) => w.state !== 'offline');
  }, [workers]);

  // Active workloads (running or queued)
  const activeDeployments = React.useMemo(() => {
    return deployments.filter((d) => d.state === 'running' || d.state === 'queued');
  }, [deployments]);

  // Capacity-weighted calculations per worker node
  const workerAllocationStats = React.useMemo(() => {
    return activeWorkers.map((w) => {
      const nodeDeployments = activeDeployments.filter((d) => d.workerId === w.id);
      const totalMemMb = Math.max(w.resources?.totalMemoryMb ?? 8192, 1);
      const hostUsedMemMb = Math.max(w.resources?.usedMemoryMb ?? 0, 0);
      const freeMemMb = Math.max(w.resources?.freeMemoryMb ?? 0, 0);

      // Estimated container memory allocation (512 MB per container default)
      const containerAllocatedMb = nodeDeployments.length * 512;
      const allocationRatioPercent = (containerAllocatedMb / totalMemMb) * 100;
      const hostTotalUsedRatioPercent = (hostUsedMemMb / totalMemMb) * 100;
      const freeRatioPercent = (freeMemMb / totalMemMb) * 100;

      const cpuCount = w.resources?.cpuCount ?? 4;
      const cpuUsagePercent = w.resources?.cpuUsagePercent ?? 0;
      const activeContainers = nodeDeployments.length;
      const maxWorkloads = w.limits?.maxConcurrentWorkloads ?? 4;

      return {
        worker: w,
        totalMemMb,
        hostUsedMemMb,
        freeMemMb,
        containerAllocatedMb,
        allocationRatioPercent,
        hostTotalUsedRatioPercent,
        freeRatioPercent,
        cpuCount,
        cpuUsagePercent,
        activeContainers,
        maxWorkloads,
        deployments: nodeDeployments,
      };
    });
  }, [activeWorkers, activeDeployments]);

  // Identify cluster skewness
  const clusterMetrics = React.useMemo(() => {
    if (workerAllocationStats.length === 0) {
      return {
        totalRamMb: 0,
        totalAllocatedMb: 0,
        averageRatio: 0,
        skewPercent: 0,
        primaryTargetWorkerId: null,
      };
    }

    const totalRamMb = workerAllocationStats.reduce((s, w) => s + w.totalMemMb, 0);
    const totalAllocatedMb = workerAllocationStats.reduce((s, w) => s + w.containerAllocatedMb, 0);
    const averageRatio = (totalAllocatedMb / Math.max(totalRamMb, 1)) * 100;

    const ratios = workerAllocationStats.map((w) => w.allocationRatioPercent);
    const maxR = Math.max(...ratios, 0);
    const minR = Math.min(...ratios, 0);
    const skewPercent = Number((maxR - minR).toFixed(1));

    // Lowest allocation node gets primary target priority
    const sorted = [...workerAllocationStats].sort(
      (a, b) => a.allocationRatioPercent - b.allocationRatioPercent
    );
    const primaryTargetWorkerId = sorted[0]?.worker.id || null;

    return {
      totalRamMb,
      totalAllocatedMb,
      averageRatio: Number(averageRatio.toFixed(1)),
      skewPercent,
      primaryTargetWorkerId,
    };
  }, [workerAllocationStats]);

  // Mutation for auto-equalizing cluster load
  const rebalanceMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      return api.rebalanceCluster({ dryRun });
    },
    onSuccess: (result, dryRun) => {
      setRebalancePlan(result);
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      queryClient.invalidateQueries({ queryKey: ['workers'] });

      if (dryRun) {
        setNotification({
          type: 'info',
          message: `Rebalance simulation computed: ${result.migrations.length} workload migration(s) planned. Cluster skew will reduce from ${result.initialSkewPercent}% to ${result.projectedSkewPercent}%.`,
        });
      } else {
        if (result.migrations.length > 0) {
          setNotification({
            type: 'success',
            message: `Successfully executed rebalance! ${result.migrations.length} container(s) relocated proportionally.`,
          });
        } else {
          setNotification({
            type: 'info',
            message: `Cluster is already well-balanced (skew: ${result.initialSkewPercent}%). No migrations required.`,
          });
        }
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Equalization failed';
      setNotification({ type: 'error', message: msg });
    },
  });

  const handleRefresh = () => {
    refetchWorkers();
    refetchDeps();
  };

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
              <Scale className="h-4 w-4" />
            </div>
            <h1
              className="text-2xl font-bold tracking-tight text-foreground"
              style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
            >
              Cluster Resource Equalizer
            </h1>
          </div>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Capacity-weighted workload distribution and manual container relocation. Equalization is
            proportional to each node's physical RAM and CPU capacity, ensuring high-spec desktops
            and thin laptops maintain fair utilization ratios.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="text-xs flex items-center gap-1.5"
            title="Refresh metrics"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sync Metrics</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => rebalanceMutation.mutate(true)}
            disabled={rebalanceMutation.isPending || activeWorkers.length < 2}
            className="text-xs flex items-center gap-1.5"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Simulate (Dry Run)</span>
          </Button>

          <Button
            size="sm"
            onClick={() => rebalanceMutation.mutate(false)}
            disabled={rebalanceMutation.isPending || activeWorkers.length < 2}
            className="text-xs font-semibold flex items-center gap-1.5 shadow-xs"
          >
            {rebalanceMutation.isPending ? (
              <>
                <span className="h-3 w-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                <span>Balancing...</span>
              </>
            ) : (
              <>
                <Scale className="h-3.5 w-3.5" />
                <span>Equalize Load</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              : notification.type === 'error'
              ? 'bg-destructive/10 border-destructive/20 text-destructive'
              : 'bg-primary/5 border-primary/20 text-foreground'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            ) : notification.type === 'error' ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            ) : (
              <Info className="h-4 w-4 shrink-0 text-primary" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-muted-foreground hover:text-foreground text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Cluster Memory</span>
              <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-xl font-bold font-mono text-foreground">
              {(clusterMetrics.totalRamMb / 1024).toFixed(1)} GB
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {(clusterMetrics.totalAllocatedMb / 1024).toFixed(1)} GB allocated (
              {clusterMetrics.averageRatio}%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Cluster Skewness</span>
              <Scale className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-foreground">
                {clusterMetrics.skewPercent}%
              </span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                  clusterMetrics.skewPercent <= 10
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : clusterMetrics.skewPercent <= 25
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                    : 'bg-destructive/10 text-destructive border border-destructive/20'
                }`}
              >
                {clusterMetrics.skewPercent <= 10
                  ? 'Balanced'
                  : clusterMetrics.skewPercent <= 25
                  ? 'Moderate Skew'
                  : 'High Skew'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Max vs min allocation difference
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Online Workers</span>
              <Server className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-xl font-bold font-mono text-foreground">
              {activeWorkers.length} Nodes
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {workers.length - activeWorkers.length} offline in mesh
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Primary Dispatch Node</span>
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div className="text-xs font-bold text-foreground truncate">
              {workerAllocationStats.find((w) => w.worker.id === clusterMetrics.primaryTargetWorkerId)
                ?.worker.name || 'Auto-Selecting...'}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Lowest capacity-weighted load ratio
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Rebalance Plan Preview (if computed) */}
      {rebalancePlan && rebalancePlan.migrations.length > 0 && (
        <Card className="border-primary/30 bg-primary/2">
          <CardHeader className="p-4.5 pb-2 border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold text-foreground flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <span>
                  {rebalancePlan.dryRun ? 'Equalizer Simulation Plan (Dry Run)' : 'Executed Migration Plan'}
                </span>
              </CardTitle>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                Initial Skew: {rebalancePlan.initialSkewPercent}% → Projected:{' '}
                {rebalancePlan.projectedSkewPercent}%
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-4.5 space-y-3">
            <p className="text-xs text-muted-foreground">
              The following container workloads are targeted for migration to achieve proportional
              balance:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {rebalancePlan.migrations.map((mig, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-border bg-card text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-foreground truncate">
                      {mig.applicationName || mig.deploymentId}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-muted-foreground">
                      {mig.memoryMb} MB
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                    <span className="truncate">{mig.sourceWorkerName}</span>
                    <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                    <span className="font-semibold text-foreground truncate">
                      {mig.targetWorkerName}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {rebalancePlan.dryRun && (
              <div className="pt-2 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => rebalanceMutation.mutate(false)}
                  disabled={rebalanceMutation.isPending}
                  className="text-xs font-semibold flex items-center gap-1.5"
                >
                  <Scale className="h-3.5 w-3.5" />
                  <span>Execute This Rebalance Plan</span>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Section 1: Visual Allocation Graphs (Capacity-Weighted vs Total Capacity) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2
              className="text-base font-bold text-foreground"
              style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
            >
              Device Capacity Allocation Visualizer
            </h2>
            <p className="text-xs text-muted-foreground">
              Allocation is measured against each workstation's total physical capacity (
              <span className="font-mono text-foreground font-semibold">Allocated RAM / Total RAM</span>
              ). Devices with lower allocation ratios receive higher scheduling priority.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Containers
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
              Host OS / Other
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full border border-border bg-secondary" />
              Available Headroom
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-5">
                <Skeleton className="h-5 w-48 mb-3" />
                <Skeleton className="h-4 w-full" />
              </Card>
            ))}
          </div>
        ) : workerAllocationStats.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <Server className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-semibold">No active worker nodes found</p>
            <p className="text-xs mt-1">Start a worker node via `pnpm dev:worker` to join the peer mesh.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {workerAllocationStats.map((stat) => {
              const isPrimaryTarget = stat.worker.id === clusterMetrics.primaryTargetWorkerId;
              const ramGb = (stat.totalMemMb / 1024).toFixed(0);

              return (
                <Card
                  key={stat.worker.id}
                  className={`overflow-hidden border transition-all ${
                    isPrimaryTarget
                      ? 'border-primary/50 bg-primary/2 shadow-xs ring-1 ring-primary/20'
                      : 'border-border'
                  }`}
                >
                  <CardContent className="p-4 sm:p-5 space-y-3">
                    {/* Worker Info Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center shrink-0">
                          <Server className="h-3.5 w-3.5 text-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-foreground">
                              {stat.worker.name}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-muted-foreground border border-border">
                              {stat.worker.ipAddress}
                            </span>
                            {isPrimaryTarget && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-primary text-primary-foreground font-semibold">
                                Primary Target (Lowest Load)
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Hardware Spec:{' '}
                            <span className="font-mono text-foreground font-medium">
                              {ramGb} GB RAM
                            </span>{' '}
                            • <span className="font-mono text-foreground">{stat.cpuCount} Cores</span>{' '}
                            • Containers:{' '}
                            <span className="font-mono text-foreground">
                              {stat.activeContainers}/{stat.maxWorkloads}
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* Right Ratio Callout */}
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <div className="flex items-baseline justify-end gap-1.5">
                            <span className="text-lg font-bold font-mono text-foreground">
                              {stat.allocationRatioPercent.toFixed(1)}%
                            </span>
                            <span className="text-[10px] text-muted-foreground">Allocation</span>
                          </div>
                          <p className="text-[10px] font-mono text-muted-foreground">
                            {stat.containerAllocatedMb} MB / {stat.totalMemMb} MB
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Proportional Stacked Capacity Bar */}
                    <div className="space-y-1">
                      <div className="h-3 w-full bg-secondary rounded-full overflow-hidden flex p-0.5 border border-border">
                        {/* Container Allocation */}
                        <div
                          className="h-full bg-primary rounded-l-full transition-all duration-300"
                          style={{ width: `${Math.min(stat.allocationRatioPercent, 100)}%` }}
                          title={`Container Allocation: ${stat.containerAllocatedMb} MB (${stat.allocationRatioPercent.toFixed(1)}%)`}
                        />
                        {/* Host Background OS Usage */}
                        <div
                          className="h-full bg-muted-foreground/30 transition-all duration-300"
                          style={{
                            width: `${Math.min(
                              Math.max(
                                stat.hostTotalUsedRatioPercent - stat.allocationRatioPercent,
                                0
                              ),
                              100
                            )}%`,
                          }}
                          title={`Host OS / Overhead: ${(stat.hostUsedMemMb - stat.containerAllocatedMb).toFixed(0)} MB`}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono pt-0.5">
                        <span>
                          Reserved: <strong>{stat.containerAllocatedMb} MB</strong> ({stat.allocationRatioPercent.toFixed(1)}%)
                        </span>
                        <span>
                          Free Headroom: <strong>{stat.freeMemMb} MB</strong> (
                          {((stat.freeMemMb / stat.totalMemMb) * 100).toFixed(1)}%)
                        </span>
                      </div>
                    </div>

                    {/* Explanatory Fairness Pill */}
                    <div className="p-2 rounded-lg bg-secondary/30 text-[10px] text-muted-foreground flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Info className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span>
                          A 512 MB workload on this <strong>{ramGb} GB</strong> node represents{' '}
                          <strong>{((512 / stat.totalMemMb) * 100).toFixed(1)}%</strong> of its total capacity.
                        </span>
                      </span>
                      <span className="font-mono text-foreground shrink-0 ml-2">
                        CPU Load: {stat.cpuUsagePercent}%
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Active Workloads & Manual Relocation Power */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2
              className="text-base font-bold text-foreground"
              style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
            >
              Active Workloads & Manual Migration
            </h2>
            <p className="text-xs text-muted-foreground">
              Manually relocate any running container workload to a specific worker node based on hardware specs.
            </p>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {activeDeployments.length} Active Container{activeDeployments.length !== 1 ? 's' : ''}
          </span>
        </div>

        {activeDeployments.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            <Container className="h-7 w-7 mx-auto mb-2 opacity-40" />
            <p className="text-xs font-semibold">No active workloads currently running</p>
            <p className="text-[11px] mt-0.5">Deploy an application to enable workload migration.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeDeployments.map((dep) => {
              const currentWorker = workers.find((w) => w.id === dep.workerId);
              const workerRamGb = currentWorker
                ? (Math.max(currentWorker.resources?.totalMemoryMb ?? 8192, 1) / 1024).toFixed(0)
                : '?';

              return (
                <Card key={dep.id} className="border border-border hover:border-primary/40 transition-colors">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-foreground truncate">
                            {dep.applicationId}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-muted-foreground">
                            {dep.gitBranch}
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
                          ID: {dep.id} • Container: {dep.containerId || 'cwc-ephemeral'}
                        </p>
                      </div>

                      {/* State badge */}
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {dep.state}
                      </span>
                    </div>

                    {/* Placement and Spec Details */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] p-2.5 rounded-lg bg-secondary/20 border border-border">
                      <div>
                        <span className="text-muted-foreground text-[10px] block">Current Host</span>
                        <span className="font-medium text-foreground truncate block">
                          {currentWorker?.name || dep.workerId || 'Pending'} ({workerRamGb} GB)
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[10px] block">Port & Memory</span>
                        <span className="font-mono text-foreground block">
                          Port {dep.assignedPort || 3000} • 512 MB
                        </span>
                      </div>
                    </div>

                    {/* Relocate Action Button */}
                    <div className="flex items-center justify-between pt-1">
                      {dep.publicUrl ? (
                        <a
                          href={dep.publicUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] font-mono text-primary hover:underline flex items-center gap-1"
                        >
                          <span>{dep.publicUrl.replace('https://', '')}</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      ) : (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Internal Mesh Only
                        </span>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedRelocateDep(dep)}
                        className="text-xs h-7.5 flex items-center gap-1.5 ml-auto cursor-pointer"
                      >
                        <ArrowLeftRight className="h-3 w-3" />
                        <span>Relocate Workload</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Relocate Workload Modal */}
      <RelocateWorkloadModal
        deployment={selectedRelocateDep}
        workers={workers}
        isOpen={!!selectedRelocateDep}
        onClose={() => setSelectedRelocateDep(null)}
        onSuccess={() => {
          setNotification({
            type: 'success',
            message: `Workload ${selectedRelocateDep?.id} successfully migrated to target host!`,
          });
        }}
      />
    </div>
  );
}
