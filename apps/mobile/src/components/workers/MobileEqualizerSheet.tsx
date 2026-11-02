import * as React from 'react';
import { SlidersHorizontal, ArrowRight, CheckCircle2 } from 'lucide-react';
import { WorkerNode, Deployment } from '@cloud-without-clouds/shared';
import { BottomSheet } from '@/components/common/BottomSheet';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { mobileApi, ClusterRebalanceResult } from '@/services/api';
import { haptics } from '@/lib/haptics';

export interface MobileEqualizerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  workers: WorkerNode[];
  deployments: Deployment[];
  selectedDeploymentId?: string | null;
  onSuccess?: () => void;
}

export function MobileEqualizerSheet({
  isOpen,
  onClose,
  workers,
  deployments,
  selectedDeploymentId,
  onSuccess,
}: MobileEqualizerSheetProps) {
  const [rebalanceData, setRebalanceData] = React.useState<ClusterRebalanceResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [targetWorkerId, setTargetWorkerId] = React.useState<string>('');
  const [relocating, setRelocating] = React.useState(false);

  const activeDeployment = deployments.find((d) => d.id === selectedDeploymentId);
  const onlineWorkers = workers.filter((w) => w.state !== 'offline');

  const fetchBalance = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await mobileApi.rebalanceCluster({ dryRun: true });
      setRebalanceData(res);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      fetchBalance();
      if (onlineWorkers.length > 0 && !targetWorkerId) {
        setTargetWorkerId(onlineWorkers[0].id);
      }
    }
  }, [isOpen, fetchBalance, onlineWorkers, targetWorkerId]);

  const handleExecuteRebalance = async () => {
    try {
      haptics.heavy();
      setLoading(true);
      await mobileApi.rebalanceCluster({ dryRun: false });
      setLoading(false);
      onSuccess?.();
      onClose();
    } catch {
      setLoading(false);
    }
  };

  const handleManualRelocate = async () => {
    if (!selectedDeploymentId || !targetWorkerId) return;
    try {
      haptics.medium();
      setRelocating(true);
      await mobileApi.relocateDeployment(selectedDeploymentId, targetWorkerId);
      setRelocating(false);
      onSuccess?.();
      onClose();
    } catch {
      setRelocating(false);
    }
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={selectedDeploymentId ? 'Relocate Workload' : 'Cluster Equalizer'}
      description={
        selectedDeploymentId
          ? 'Transfer active container to an eligible laptop worker node.'
          : 'Proportional workload redistribution across distributed laptops.'
      }
    >
      <div className="space-y-4">
        {selectedDeploymentId && activeDeployment ? (
          /* Manual Workload Relocation Mode */
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-secondary/50 border border-border space-y-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                Workload to Relocate
              </span>
              <div className="text-xs font-semibold text-foreground font-mono">
                {activeDeployment.applicationId} ({activeDeployment.id})
              </div>
              <div className="text-[11px] text-muted-foreground">
                Currently running on: <span className="text-foreground font-medium">{activeDeployment.workerId}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Select Target Laptop Node</label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar">
                {onlineWorkers.map((w) => {
                  const isCurrent = w.id === activeDeployment.workerId;
                  const isSelected = targetWorkerId === w.id;

                  return (
                    <button
                      key={w.id}
                      disabled={isCurrent}
                      onClick={() => {
                        haptics.light();
                        setTargetWorkerId(w.id);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between ${
                        isCurrent
                          ? 'opacity-40 border-border bg-secondary cursor-not-allowed'
                          : isSelected
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : 'border-border bg-card hover:bg-secondary/60'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-semibold text-foreground line-clamp-1">{w.name}</div>
                        <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                          Free RAM: {w.resources?.freeMemoryMb || 0}MB • Containers: {w.resources?.activeContainers || 0}
                        </div>
                      </div>
                      {isSelected && !isCurrent && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              variant="emerald"
              size="lg"
              disabled={relocating || !targetWorkerId}
              onClick={handleManualRelocate}
              className="w-full space-x-2"
            >
              <ArrowRight className={`h-4 w-4 ${relocating ? 'animate-spin' : ''}`} />
              <span>{relocating ? 'Relocating Container...' : 'Migrate Workload Now'}</span>
            </Button>
          </div>
        ) : (
          /* Autonomous Equalizer Rebalance Mode */
          <div className="space-y-3">
            {rebalanceData && (
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-secondary/50 border border-border">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Cluster Skew</span>
                  <div className="text-lg font-bold font-mono text-foreground mt-0.5">
                    {rebalanceData.initialSkewPercent}%
                  </div>
                  <span className="text-[10px] text-emerald-500">
                    Projected: {rebalanceData.projectedSkewPercent}%
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-secondary/50 border border-border">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Target Load</span>
                  <div className="text-lg font-bold font-mono text-emerald-500 mt-0.5">
                    {rebalanceData.targetClusterRatioPercent}%
                  </div>
                  <span className="text-[10px] text-muted-foreground">Proportional</span>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <span className="text-xs font-semibold text-foreground">Node Load Ratios</span>
              <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar">
                {rebalanceData?.workerStats.map((stat) => (
                  <div
                    key={stat.workerId}
                    className="p-2 rounded-xl bg-secondary/30 border border-border flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-foreground text-[11px] line-clamp-1">{stat.workerName}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {stat.allocatedMemoryMb}MB allocated ({stat.activeContainers} pods)
                      </div>
                    </div>
                    <Badge variant={stat.isPrimaryTarget ? 'success' : 'secondary'} className="font-mono text-[10px]">
                      {(stat.initialRatio * 100).toFixed(1)}%
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <Button
              variant="emerald"
              size="lg"
              disabled={loading}
              onClick={handleExecuteRebalance}
              className="w-full space-x-2"
            >
              <SlidersHorizontal className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Executing Rebalance...' : 'Execute Autonomous Rebalance'}</span>
            </Button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
