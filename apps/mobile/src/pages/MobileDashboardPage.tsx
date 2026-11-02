import * as React from 'react';
import {
  Plus,
  Laptop,
  Layers,
  Cpu,
  ShieldCheck,
  GitBranch,
  Scale,
  Zap,
  Download,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/common/Button';
import { MobileAnimatedPipeline } from '@/components/pipeline/MobileAnimatedPipeline';
import { MobileDeploymentCard } from '@/components/deploy/MobileDeploymentCard';
import { MobileDeploySheet } from '@/components/deploy/MobileDeploySheet';
import { MobileLogsViewer } from '@/components/deploy/MobileLogsViewer';
import { MobilePairWorkerModal } from '@/components/workers/MobilePairWorkerModal';
import { MobileEqualizerSheet } from '@/components/workers/MobileEqualizerSheet';
import { MobileDownloadModal } from '@/components/common/MobileDownloadModal';
import { MobileFinOpsWidget } from '@/components/finops/MobileFinOpsWidget';
import { mobileApi } from '@/services/api';
import { haptics } from '@/lib/haptics';

export function MobileDashboardPage() {
  const [deploySheetOpen, setDeploySheetOpen] = React.useState(false);
  const [pairModalOpen, setPairModalOpen] = React.useState(false);
  const [equalizerOpen, setEqualizerOpen] = React.useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = React.useState(false);
  const [activeLogDepId, setActiveLogDepId] = React.useState<string | null>(null);
  const [selectedRelocateDepId, setSelectedRelocateDepId] = React.useState<string | null>(null);

  // Live health query
  const { data: health, refetch: refetchHealth } = useQuery({
    queryKey: ['health'],
    queryFn: () => mobileApi.checkHealth(),
    refetchInterval: 10000,
  });

  // Queries
  const { data: workers = [], refetch: refetchWorkers } = useQuery({
    queryKey: ['workers'],
    queryFn: () => mobileApi.getWorkers(),
    refetchInterval: 6000,
  });

  const { data: deployments = [], refetch: refetchDeployments } = useQuery({
    queryKey: ['deployments'],
    queryFn: () => mobileApi.getDeployments(),
    refetchInterval: 5000,
  });

  const { data: apps = [], refetch: refetchApps } = useQuery({
    queryKey: ['apps'],
    queryFn: () => mobileApi.getApplications(),
    refetchInterval: 6000,
  });

  const onlineWorkers = workers.filter((w) => w.state !== 'offline');
  const runningDeployments = deployments.filter((d) => d.state === 'running');
  const readyRoutes = deployments.filter(
    (d) => d.state === 'running' && d.routingStatus === 'ready'
  ).length;

  const handleRefreshAll = () => {
    refetchHealth();
    refetchWorkers();
    refetchDeployments();
    refetchApps();
  };

  const handleCancelDeployment = async (depId: string) => {
    haptics.heavy();
    await mobileApi.cancelDeployment(depId);
    handleRefreshAll();
  };

  return (
    <div className="space-y-4 pb-20 px-3 sm:px-4 pt-3 max-w-lg mx-auto">
      {/* 1. Live System Info Bar (Dynamically fetched from backend /health) */}
      <div className="rounded-xl border border-border/80 bg-card p-3 shadow-xs">
        <div className="grid grid-cols-4 gap-2 text-center border-b border-border/50 pb-2 mb-2">
          <div>
            <span className="text-[9px] uppercase font-mono text-muted-foreground block">Service</span>
            <span className="text-[11px] font-semibold text-foreground truncate block font-mono">
              {health?.service ? health.service.replace('cloud-without-clouds-', '') : 'control-plane'}
            </span>
          </div>
          <div>
            <span className="text-[9px] uppercase font-mono text-muted-foreground block">Version</span>
            <span className="text-[11px] font-semibold text-foreground block font-mono">
              v{health?.version || '0.1.0'}
            </span>
          </div>
          <div>
            <span className="text-[9px] uppercase font-mono text-muted-foreground block">Uptime</span>
            <span className="text-[11px] font-semibold text-foreground block font-mono">
              {health?.uptime !== undefined ? `${health.uptime}s` : 'active'}
            </span>
          </div>
          <div>
            <span className="text-[9px] uppercase font-mono text-muted-foreground block">Environment</span>
            <span className="text-[11px] font-semibold text-foreground block font-mono capitalize">
              {health?.environment || 'development'}
            </span>
          </div>
        </div>

        {/* Live Fallback Callout */}
        <div className="flex items-center justify-between text-[11px] text-amber-500/90 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg">
          <div className="flex items-center space-x-1.5 truncate mr-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
            <span className="truncate">
              {health?.dependencies?.database?.message || 'Control plane active in local development fallback mode.'}
            </span>
          </div>
          <span className="text-[9px] font-mono uppercase bg-amber-500/20 px-1.5 py-0.5 rounded font-bold shrink-0">
            {health?.online ? 'LIVE' : 'MOCK'}
          </span>
        </div>
      </div>

      {/* 2. Direct Download App Banner */}
      <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="h-8 w-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-bold">
            <Download className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-foreground flex items-center space-x-1.5">
              <span>Install Mobile Companion</span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-500">
                PWA + Expo 58.0.5
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Direct download or 1-tap install on your phone
            </p>
          </div>
        </div>

        <Button
          variant="emerald"
          size="sm"
          onClick={() => {
            haptics.light();
            setDownloadModalOpen(true);
          }}
          className="h-7 text-[11px] px-2.5"
        >
          Download
        </Button>
      </div>

      {/* 3. Primary Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={() => {
            haptics.medium();
            setDeploySheetOpen(true);
          }}
          className="h-10 text-xs font-semibold space-x-1.5 bg-foreground text-background hover:bg-foreground/90 shadow-xs"
        >
          <Plus className="h-4 w-4" />
          <span>Deploy Application</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            haptics.light();
            setPairModalOpen(true);
          }}
          className="h-10 text-xs font-semibold space-x-1.5 border-border bg-card"
        >
          <Laptop className="h-4 w-4 text-emerald-500" />
          <span>Contribute Laptop</span>
        </Button>
      </div>

      {/* 4. Distributed Execution Pipeline */}
      <MobileAnimatedPipeline currentStage="ingress" />

      {/* 5. Four Stats Cards (Fetched directly from live cluster state) */}
      <div className="grid grid-cols-2 gap-2">
        {/* Active Workers */}
        <div className="p-3 rounded-xl bg-card border border-border shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Active Workers</span>
            <Cpu className="h-4 w-4 text-muted-foreground/80" />
          </div>
          <div className="text-xl font-bold font-heading text-foreground">
            {onlineWorkers.length}
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">
            {onlineWorkers.length} of {workers.length} Online
          </div>
        </div>

        {/* Active Workloads */}
        <div className="p-3 rounded-xl bg-card border border-border shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Active Workloads</span>
            <Layers className="h-4 w-4 text-muted-foreground/80" />
          </div>
          <div className="text-xl font-bold font-heading text-foreground">
            {runningDeployments.length}
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">
            {runningDeployments.length} of {deployments.length} Running
          </div>
        </div>

        {/* Scheduling Policy */}
        <div className="p-3 rounded-xl bg-card border border-border shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Scheduling Policy</span>
            <ShieldCheck className="h-4 w-4 text-muted-foreground/80" />
          </div>
          <div className="text-xl font-bold font-heading text-foreground">
            S(W)
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">
            Least-Loaded Node
          </div>
        </div>

        {/* Ingress & Gateway */}
        <div className="p-3 rounded-xl bg-card border border-border shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Ingress & Gateway</span>
            <GitBranch className="h-4 w-4 text-muted-foreground/80" />
          </div>
          <div className="text-xl font-bold font-heading text-emerald-500">
            {readyRoutes > 0 ? 'Live' : deployments.length > 0 ? 'Pending' : 'Idle'}
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">
            {readyRoutes} ready route{readyRoutes === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {/* 6. Quick Tool Buttons Row */}
      <div className="flex space-x-1.5 overflow-x-auto no-scrollbar pb-1">
        <button
          onClick={() => {
            haptics.light();
            setEqualizerOpen(true);
          }}
          className="whitespace-nowrap px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium flex items-center space-x-1.5 text-foreground hover:bg-secondary transition-colors"
        >
          <Scale className="h-3.5 w-3.5 text-emerald-500" />
          <span>Load Equalizer</span>
        </button>

        <button
          onClick={() => {
            haptics.heavy();
            if (workers.length > 0) {
              mobileApi.simulateWorkerDropout(workers[0].id).then(handleRefreshAll);
            }
          }}
          className="whitespace-nowrap px-3 py-1.5 rounded-lg border border-destructive/30 bg-destructive/10 text-xs font-medium flex items-center space-x-1.5 text-destructive hover:bg-destructive/20 transition-colors"
        >
          <Zap className="h-3.5 w-3.5" />
          <span>Chaos Failover Drill</span>
        </button>

        <button
          onClick={() => {
            haptics.light();
            setPairModalOpen(true);
          }}
          className="whitespace-nowrap px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium flex items-center space-x-1.5 text-foreground hover:bg-secondary transition-colors"
        >
          <Laptop className="h-3.5 w-3.5 text-emerald-500" />
          <span>Pair Laptop (QR)</span>
        </button>
      </div>

      {/* 7. Active Workloads Section */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-foreground">
            Active Deployments ({runningDeployments.length})
          </h3>
          <button
            onClick={() => {
              haptics.light();
              setDeploySheetOpen(true);
            }}
            className="text-xs font-semibold text-emerald-500 hover:text-emerald-400"
          >
            + Deploy
          </button>
        </div>

        {deployments.length === 0 ? (
          <div className="p-6 rounded-xl bg-card border border-border text-center space-y-2">
            <p className="text-xs text-muted-foreground">No workloads deployed yet.</p>
            <Button
              variant="default"
              size="sm"
              onClick={() => setDeploySheetOpen(true)}
              className="bg-foreground text-background"
            >
              Deploy First App
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {deployments.map((dep) => {
              const matchedApp = apps.find((a) => a.id === dep.applicationId);
              const matchedWorker = workers.find((w) => w.id === dep.workerId);

              return (
                <MobileDeploymentCard
                  key={dep.id}
                  deployment={dep}
                  app={matchedApp}
                  worker={matchedWorker}
                  onViewLogs={(id) => {
                    haptics.light();
                    setActiveLogDepId(id);
                  }}
                  onRelocate={(id) => {
                    haptics.light();
                    setSelectedRelocateDepId(id);
                    setEqualizerOpen(true);
                  }}
                  onCancel={handleCancelDeployment}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* 8. FinOps Arbitrage Widget */}
      <MobileFinOpsWidget />

      {/* Slide-up Modals and Sheets */}
      <MobileDeploySheet
        isOpen={deploySheetOpen}
        onClose={() => setDeploySheetOpen(false)}
        onSuccess={handleRefreshAll}
      />

      <MobilePairWorkerModal
        isOpen={pairModalOpen}
        onClose={() => setPairModalOpen(false)}
      />

      <MobileEqualizerSheet
        isOpen={equalizerOpen}
        onClose={() => {
          setEqualizerOpen(false);
          setSelectedRelocateDepId(null);
        }}
        workers={workers}
        deployments={deployments}
        selectedDeploymentId={selectedRelocateDepId}
        onSuccess={handleRefreshAll}
      />

      <MobileLogsViewer
        deploymentId={activeLogDepId}
        onClose={() => setActiveLogDepId(null)}
      />

      <MobileDownloadModal
        isOpen={downloadModalOpen}
        onClose={() => setDownloadModalOpen(false)}
      />
    </div>
  );
}
