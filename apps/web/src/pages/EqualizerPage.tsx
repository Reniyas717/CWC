import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Scale,
  RefreshCw,
  Server,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldCheck,
  Laptop,
  SlidersHorizontal,
  Sparkles,
  Zap,
  Globe2,
} from 'lucide-react';
import { Deployment, WorkerNode, AppConfig } from '@cloud-without-clouds/shared';
import { api, ClusterRebalanceResult } from '@/services/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RelocateWorkloadModal } from '@/components/balancer/RelocateWorkloadModal';

export function EqualizerPage() {
  const queryClient = useQueryClient();
  const [selectedRelocateDep, setSelectedRelocateDep] = React.useState<Deployment | null>(null);
  const [, setRebalancePlan] = React.useState<ClusterRebalanceResult | null>(null);
  const [notification, setNotification] = React.useState<{
    type: 'success' | 'info' | 'error';
    title: string;
    message: string;
  } | null>(null);

  // Fetch online workers
  const {
    data: workers = [],
    isLoading: workersLoading,
    refetch: refetchWorkers,
  } = useQuery<WorkerNode[]>({
    queryKey: ['workers'],
    queryFn: () => api.getWorkers(),
    refetchInterval: 5000,
  });

  // Fetch applications for real memory limits
  const { data: apps = [] } = useQuery<AppConfig[]>({
    queryKey: ['applications'],
    queryFn: () => api.getApplications(),
    refetchInterval: 10000,
  });

  const getAppMemoryMb = React.useCallback(
    (appId: string) => {
      const matched = apps.find((a) => a.id === appId || a.slug === appId);
      return matched?.resourceLimits?.memoryLimitMb ?? 512;
    },
    [apps]
  );

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

  const activeWorkers = React.useMemo(() => {
    return workers.filter((w) => w.state !== 'offline');
  }, [workers]);

  const activeDeployments = React.useMemo(() => {
    return deployments.filter((d) => d.state === 'running' || d.state === 'queued');
  }, [deployments]);

  // Clean, intuitive device stats
  const deviceStats = React.useMemo(() => {
    return activeWorkers.map((w) => {
      const nodeDeployments = activeDeployments.filter((d) => d.workerId === w.id);
      const totalRamMb = Math.max(w.resources?.totalMemoryMb ?? 8192, 1);
      const totalRamGb = (totalRamMb / 1024).toFixed(0);
      const freeRamMb = Math.max(w.resources?.freeMemoryMb ?? 0, 0);
      const freeRamGb = (freeRamMb / 1024).toFixed(1);

      // Total memory reserved by apps on this node (using exact app resource limits)
      const allocatedMb = nodeDeployments.reduce(
        (sum, d) => sum + getAppMemoryMb(d.applicationId),
        0
      );
      const allocatedGb = (allocatedMb / 1024).toFixed(1);
      const loadPercentage = Math.min(100, Math.round((allocatedMb / totalRamMb) * 100));

      const cpuCount = w.resources?.cpuCount ?? 4;
      const maxWorkloads = w.limits?.maxConcurrentWorkloads ?? 4;

      return {
        worker: w,
        totalRamMb,
        totalRamGb,
        freeRamMb,
        freeRamGb,
        allocatedMb,
        allocatedGb,
        loadPercentage,
        cpuCount,
        maxWorkloads,
        deployments: nodeDeployments,
      };
    });
  }, [activeWorkers, activeDeployments, getAppMemoryMb]);

  // Overall cluster balance state
  const clusterSummary = React.useMemo(() => {
    if (deviceStats.length === 0) {
      return {
        isBalanced: true,
        skew: 0,
        totalClusterRamGb: '0',
        totalAppsCount: 0,
        bestDeviceName: '',
      };
    }

    const totalRamMb = deviceStats.reduce((acc, d) => acc + d.totalRamMb, 0);
    const totalClusterRamGb = (totalRamMb / 1024).toFixed(0);

    const loads = deviceStats.map((d) => d.loadPercentage);
    const maxLoad = Math.max(...loads, 0);
    const minLoad = Math.min(...loads, 0);
    const skew = maxLoad - minLoad;
    const isBalanced = skew <= 15; // Within 15% difference is considered healthy

    // Device with lowest load is the recommended device
    const sorted = [...deviceStats].sort((a, b) => a.loadPercentage - b.loadPercentage);
    const bestDeviceName = sorted[0]?.worker.name || '';

    return {
      isBalanced,
      skew,
      totalClusterRamGb,
      totalAppsCount: activeDeployments.length,
      bestDeviceName,
    };
  }, [deviceStats, activeDeployments]);

  // Automatic Rebalance Mutation
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
          title: 'Simulation Ready',
          message:
            result.migrations.length > 0
              ? `Preview: Moving ${result.migrations.length} app(s) would reduce cluster imbalance from ${result.initialSkewPercent}% to ${result.projectedSkewPercent}%.`
              : 'Your cluster is already well-balanced. No moves are required.',
        });
      } else {
        if (result.migrations.length > 0) {
          setNotification({
            type: 'success',
            title: 'Cluster Equalized Successfully!',
            message: `Moved ${result.migrations.length} app(s) to balance hardware capacity across all workstations.`,
          });
        } else {
          setNotification({
            type: 'info',
            title: 'Already Balanced',
            message:
              'All laptops and workstations are already sharing workloads fairly according to their specs.',
          });
        }
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Rebalancing failed. Please try again.';
      setNotification({
        type: 'error',
        title: 'Equalization Failed',
        message: msg,
      });
    },
  });

  // Direct 1-Click Quick Move Mutation
  const quickMoveMutation = useMutation({
    mutationFn: async ({
      depId,
      targetWorkerId,
    }: {
      depId: string;
      targetWorkerId: string;
      appName: string;
      targetName: string;
    }) => {
      return api.relocateDeployment(depId, targetWorkerId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      setNotification({
        type: 'success',
        title: 'Workload Shifted Instantly!',
        message: `Relocated "${variables.appName}" to ${variables.targetName}. Live loads updated.`,
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Quick move failed';
      setNotification({
        type: 'error',
        title: 'Move Failed',
        message: msg,
      });
    },
  });

  // 1-Click Strategy Presets
  const applyStrategy = async (strategy: 'balanced' | 'desktop' | 'spread') => {
    if (activeWorkers.length === 0 || activeDeployments.length === 0) return;

    if (strategy === 'balanced') {
      rebalanceMutation.mutate(false);
      return;
    }

    if (strategy === 'desktop') {
      // Find worker with largest total memory (e.g. Workstation Alpha 16GB)
      const sortedByRam = [...activeWorkers].sort(
        (a, b) => (b.resources?.totalMemoryMb ?? 0) - (a.resources?.totalMemoryMb ?? 0)
      );
      const desktopWorker = sortedByRam[0];
      if (!desktopWorker) return;

      for (const dep of activeDeployments) {
        if (dep.workerId !== desktopWorker.id) {
          await api.relocateDeployment(dep.id, desktopWorker.id);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      setNotification({
        type: 'success',
        title: 'Desktop Priority Mode Applied!',
        message: `Workloads shifted onto ${desktopWorker.name} (${(
          (desktopWorker.resources?.totalMemoryMb ?? 16384) / 1024
        ).toFixed(0)} GB RAM) to keep laptops quiet and save battery.`,
      });
      return;
    }

    if (strategy === 'spread') {
      // Distribute evenly 1 by 1 across active workers
      for (let i = 0; i < activeDeployments.length; i++) {
        const targetWorker = activeWorkers[i % activeWorkers.length];
        if (activeDeployments[i].workerId !== targetWorker.id) {
          await api.relocateDeployment(activeDeployments[i].id, targetWorker.id);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      setNotification({
        type: 'success',
        title: 'Distributed Spread Applied!',
        message: `Workloads distributed evenly across ${activeWorkers.length} nodes for maximum resilience.`,
      });
      return;
    }
  };

  const handleRefresh = () => {
    refetchWorkers();
    refetchDeps();
  };

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* Top Title & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
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
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            Intelligently balance workloads across laptops and workstations based on their hardware
            capacity.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="text-xs flex items-center gap-1.5 cursor-pointer"
            title="Sync device stats"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Sync</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => rebalanceMutation.mutate(true)}
            disabled={rebalanceMutation.isPending || activeWorkers.length < 2}
            className="text-xs cursor-pointer"
          >
            Preview Rebalance
          </Button>

          <Button
            size="sm"
            onClick={() => rebalanceMutation.mutate(false)}
            disabled={rebalanceMutation.isPending || activeWorkers.length < 2}
            className="text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            {rebalanceMutation.isPending ? (
              <>
                <span className="h-3 w-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                <span>Balancing...</span>
              </>
            ) : (
              <>
                <Scale className="h-3.5 w-3.5" />
                <span>Equalize Load Now</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-start justify-between gap-3 ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              : notification.type === 'error'
              ? 'bg-destructive/10 border-destructive/20 text-destructive'
              : 'bg-primary/5 border-primary/20 text-foreground'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {notification.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
            ) : notification.type === 'error' ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
            ) : (
              <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            )}
            <div>
              <p className="font-bold text-sm leading-tight">{notification.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{notification.message}</p>
            </div>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Hero Overview Card: Plain-English Status */}
      <Card className="border border-border shadow-xs bg-card overflow-hidden">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2 flex-wrap">
                {clusterSummary.isBalanced ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Cluster Load is Fairly Balanced
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Uneven Workload Distribution Detected
                  </span>
                )}
                <span className="text-xs text-muted-foreground font-mono">
                  {activeWorkers.length} online devices • {clusterSummary.totalClusterRamGb} GB total
                  RAM
                </span>
              </div>

              <h2
                className="text-lg font-bold text-foreground"
                style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
              >
                {clusterSummary.isBalanced
                  ? 'All devices are carrying workloads proportional to their hardware power.'
                  : 'Some devices are working harder than others. Equalizing will rebalance apps.'}
              </h2>

              <p className="text-xs text-muted-foreground leading-relaxed">
                A <strong>16 GB desktop</strong> can easily run multiple apps, while a{' '}
                <strong>4 GB laptop</strong> should only run light tasks. Equalizing balances by{' '}
                <strong>percentage of capacity</strong>, keeping small laptops cool while putting
                idle workstations to work.
              </p>
            </div>

            {/* Quick Balance Button on Hero */}
            <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0 justify-center">
              <Button
                size="default"
                onClick={() => rebalanceMutation.mutate(false)}
                disabled={rebalanceMutation.isPending || activeWorkers.length < 2}
                className="h-10 px-5 text-xs font-bold shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Scale className="h-4 w-4" />
                <span>Equalize Load Now</span>
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                1-click redistribution • Zero downtime
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Strategy Control Bar: Super Flexible Presets */}
      <div className="p-3.5 bg-secondary/30 rounded-xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>Quick Balance Strategies:</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyStrategy('balanced')}
            disabled={rebalanceMutation.isPending || activeWorkers.length < 2}
            className="text-xs h-8 px-2.5 flex items-center gap-1.5 cursor-pointer"
          >
            <Scale className="h-3.5 w-3.5 text-emerald-500" />
            <span>Fair Capacity Share</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => applyStrategy('desktop')}
            disabled={rebalanceMutation.isPending || activeWorkers.length < 2}
            className="text-xs h-8 px-2.5 flex items-center gap-1.5 cursor-pointer"
          >
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <span>Desktop Priority</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => applyStrategy('spread')}
            disabled={rebalanceMutation.isPending || activeWorkers.length < 2}
            className="text-xs h-8 px-2.5 flex items-center gap-1.5 cursor-pointer"
          >
            <Globe2 className="h-3.5 w-3.5 text-sky-500" />
            <span>Distributed Spread</span>
          </Button>
        </div>
      </div>

      {/* Connected Devices Grid (Clear, intuitive, beautiful) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2
            className="text-base font-bold text-foreground"
            style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
          >
            Connected Workstations & Running Apps
          </h2>
          <span className="text-xs text-muted-foreground font-mono">
            {activeDeployments.length} Active App{activeDeployments.length !== 1 ? 's' : ''} Running
          </span>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-5">
                <Skeleton className="h-6 w-36 mb-3" />
                <Skeleton className="h-4 w-full mb-4" />
                <Skeleton className="h-12 w-full" />
              </Card>
            ))}
          </div>
        ) : deviceStats.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            <Server className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold text-foreground">No worker nodes connected</p>
            <p className="text-xs mt-1">Start a worker on your workstation to join the peer mesh.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {deviceStats.map((device) => {
              const isBest = device.worker.name === clusterSummary.bestDeviceName;
              const isHeavy = device.loadPercentage >= 70;

              return (
                <Card
                  key={device.worker.id}
                  className={`flex flex-col justify-between transition-all border ${
                    isBest
                      ? 'border-primary/40 bg-card shadow-xs ring-1 ring-primary/20'
                      : 'border-border bg-card'
                  }`}
                >
                  <CardContent className="p-5 space-y-4">
                    {/* Device Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                          {device.totalRamMb >= 12000 ? (
                            <Server className="h-4.5 w-4.5 text-foreground" />
                          ) : (
                            <Laptop className="h-4.5 w-4.5 text-foreground" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm text-foreground truncate">
                              {device.worker.name}
                            </h3>
                          </div>
                          <p className="text-[11px] font-mono text-muted-foreground">
                            {device.worker.ipAddress}
                          </p>
                        </div>
                      </div>

                      {/* Specs Badge */}
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-secondary text-foreground border border-border shrink-0">
                        {device.totalRamGb} GB RAM
                      </span>
                    </div>

                    {/* Load Gauge (Clear progress bar) */}
                    <div className="p-3 rounded-xl bg-secondary/30 border border-border space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">Hardware Load</span>
                        <span className="font-mono font-bold text-foreground">
                          {device.loadPercentage}%
                        </span>
                      </div>

                      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            isHeavy
                              ? 'bg-amber-500'
                              : device.loadPercentage > 0
                              ? 'bg-emerald-500'
                              : 'bg-muted-foreground/30'
                          }`}
                          style={{ width: `${Math.max(device.loadPercentage, 4)}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{device.freeRamGb} GB free RAM</span>
                        <span>
                          {device.deployments.length} / {device.maxWorkloads} app slots
                        </span>
                      </div>
                    </div>

                    {/* Best Target Tag */}
                    {isBest && (
                      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                        <span>Recommended target for new workloads (most headroom).</span>
                      </div>
                    )}

                    {/* Apps Running on this Device */}
                    <div className="space-y-2 pt-1 border-t border-border">
                      <span className="text-[11px] font-semibold text-muted-foreground block">
                        Workloads on this machine ({device.deployments.length}):
                      </span>

                      {device.deployments.length === 0 ? (
                        <div className="p-3 rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground">
                          No apps assigned. Ready to take work.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {device.deployments.map((dep) => (
                            <div
                              key={dep.id}
                              className="p-3 rounded-lg border border-border bg-card/80 space-y-2 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-mono font-bold text-foreground truncate text-xs">
                                    {dep.applicationId}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground font-mono">
                                    Port {dep.assignedPort || 3000} •{' '}
                                    {getAppMemoryMb(dep.applicationId)} MB RAM
                                  </p>
                                </div>

                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setSelectedRelocateDep(dep)}
                                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1"
                                  title="Open detailed custom relocation modal"
                                >
                                  <SlidersHorizontal className="h-3 w-3" />
                                  <span>Details</span>
                                </Button>
                              </div>

                              {/* Direct 1-Click Quick Move Chips */}
                              <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-border/60">
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  Quick shift:
                                </span>
                                {activeWorkers
                                  .filter((other) => other.id !== device.worker.id)
                                  .map((other) => {
                                    const otherGb = (
                                      (other.resources?.totalMemoryMb ?? 8192) / 1024
                                    ).toFixed(0);
                                    const shortName = other.name.split(' ')[0];
                                    return (
                                      <button
                                        key={other.id}
                                        type="button"
                                        disabled={quickMoveMutation.isPending}
                                        onClick={() =>
                                          quickMoveMutation.mutate({
                                            depId: dep.id,
                                            targetWorkerId: other.id,
                                            appName: dep.applicationId,
                                            targetName: other.name,
                                          })
                                        }
                                        className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-secondary hover:bg-primary hover:text-primary-foreground border border-border transition-colors cursor-pointer flex items-center gap-1"
                                        title={`Instantly shift ${dep.applicationId} to ${other.name}`}
                                      >
                                        <span>→ {shortName}</span>
                                        <span className="opacity-60 text-[9px]">({otherGb}G)</span>
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Simple Concept Explainer Banner */}
      <div className="p-4 rounded-xl bg-secondary/20 border border-border text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            <Info className="h-3.5 w-3.5 text-foreground" />
          </div>
          <div>
            <span className="font-semibold text-foreground">Why Capacity-Weighted Equalization?</span>
            <p className="text-[11px] mt-0.5">
              1 GB of RAM is 6% of a 16 GB workstation, but 50% of a 2 GB laptop. Equalizing guarantees
              that smaller devices are never overwhelmed while powerful machines sit idle.
            </p>
          </div>
        </div>
      </div>

      {/* Simplified Relocation Modal */}
      <RelocateWorkloadModal
        deployment={selectedRelocateDep}
        workers={workers}
        memoryMb={selectedRelocateDep ? getAppMemoryMb(selectedRelocateDep.applicationId) : 512}
        isOpen={!!selectedRelocateDep}
        onClose={() => setSelectedRelocateDep(null)}
        onSuccess={() => {
          setNotification({
            type: 'success',
            title: 'App Moved Successfully!',
            message: `Workload ${
              selectedRelocateDep?.applicationId || ''
            } has been relocated to its new device.`,
          });
        }}
      />
    </div>
  );
}
