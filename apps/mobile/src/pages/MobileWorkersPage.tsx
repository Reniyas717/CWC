import * as React from 'react';
import { Plus, SlidersHorizontal, RefreshCw, ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/common/Button';
import { MobileWorkerCard } from '@/components/workers/MobileWorkerCard';
import { MobilePairWorkerModal } from '@/components/workers/MobilePairWorkerModal';
import { MobileEqualizerSheet } from '@/components/workers/MobileEqualizerSheet';
import { mobileApi } from '@/services/api';
import { haptics } from '@/lib/haptics';

export function MobileWorkersPage() {
  const [pairModalOpen, setPairModalOpen] = React.useState(false);
  const [equalizerOpen, setEqualizerOpen] = React.useState(false);
  const [sweepMessage, setSweepMessage] = React.useState<string | null>(null);

  const { data: workers = [], refetch: refetchWorkers } = useQuery({
    queryKey: ['workers'],
    queryFn: () => mobileApi.getWorkers(),
    refetchInterval: 5000,
  });

  const { data: deployments = [], refetch: refetchDeployments } = useQuery({
    queryKey: ['deployments'],
    queryFn: () => mobileApi.getDeployments(),
  });

  const onlineWorkers = workers.filter((w) => w.state !== 'offline');

  const handleSimulateDropout = async (workerId: string) => {
    haptics.heavy();
    await mobileApi.simulateWorkerDropout(workerId);
    refetchWorkers();
    refetchDeployments();
  };

  const handleSimulateReconnect = async (workerId: string) => {
    haptics.medium();
    await mobileApi.simulateWorkerReconnect(workerId);
    refetchWorkers();
    refetchDeployments();
  };

  const handleSweep = async () => {
    haptics.medium();
    const result = await mobileApi.sweepWorkers();
    setSweepMessage(
      result.rescheduledDeployments.length > 0
        ? `Swept cluster: autonomous failover recovered ${result.rescheduledDeployments.length} workloads!`
        : `Cluster health verified. All ${onlineWorkers.length} online nodes are healthy.`
    );
    refetchWorkers();
    refetchDeployments();
    setTimeout(() => setSweepMessage(null), 4000);
  };

  return (
    <div className="space-y-4 pb-20 px-3.5 pt-3 max-w-md mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-bold text-base text-foreground">Worker Fleet</h2>
          <p className="text-xs text-muted-foreground">
            {onlineWorkers.length} of {workers.length} nodes connected over Tailscale mesh
          </p>
        </div>

        <Button
          variant="emerald"
          size="sm"
          onClick={() => {
            haptics.medium();
            setPairModalOpen(true);
          }}
          className="space-x-1"
        >
          <Plus className="h-4 w-4" />
          <span>Add Node</span>
        </Button>
      </div>

      {/* Sweep / Health Feedback Alert */}
      {sweepMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-xs flex items-center space-x-2 animate-in fade-in">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>{sweepMessage}</span>
        </div>
      )}

      {/* Quick Action Buttons */}
      <div className="flex space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            haptics.light();
            setEqualizerOpen(true);
          }}
          className="flex-1 space-x-1.5 h-9 bg-card border-border/80"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-500" />
          <span>Rebalance Equalizer</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleSweep}
          className="flex-1 space-x-1.5 h-9 bg-card border-border/80"
        >
          <RefreshCw className="h-3.5 w-3.5 text-emerald-500" />
          <span>Health Sweep</span>
        </Button>
      </div>

      {/* Workers List */}
      <div className="space-y-3">
        {workers.map((worker) => (
          <MobileWorkerCard
            key={worker.id}
            worker={worker}
            onSimulateDropout={handleSimulateDropout}
            onSimulateReconnect={handleSimulateReconnect}
          />
        ))}
      </div>

      {/* Modals */}
      <MobilePairWorkerModal
        isOpen={pairModalOpen}
        onClose={() => setPairModalOpen(false)}
      />

      <MobileEqualizerSheet
        isOpen={equalizerOpen}
        onClose={() => setEqualizerOpen(false)}
        workers={workers}
        deployments={deployments}
        onSuccess={() => {
          refetchWorkers();
          refetchDeployments();
        }}
      />
    </div>
  );
}
