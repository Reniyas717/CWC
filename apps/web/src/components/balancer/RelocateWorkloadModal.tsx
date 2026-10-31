import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  X,
  Server,
  HardDrive,
  Cpu,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Deployment, WorkerNode } from '@cloud-without-clouds/shared';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';

interface RelocateWorkloadModalProps {
  deployment: Deployment | null;
  workers: WorkerNode[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RelocateWorkloadModal({
  deployment,
  workers,
  isOpen,
  onClose,
  onSuccess,
}: RelocateWorkloadModalProps) {
  const queryClient = useQueryClient();
  const [selectedTargetId, setSelectedTargetId] = React.useState<string>('');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Default memory cap if not provided
  const workloadMemoryMb = 512;

  // Identify source worker
  const sourceWorker = React.useMemo(() => {
    if (!deployment?.workerId) return null;
    return workers.find((w) => w.id === deployment.workerId) || null;
  }, [deployment, workers]);

  // Compute eligible target workers and auto-select best candidate
  const candidateWorkers = React.useMemo(() => {
    return workers.map((w) => {
      const isCurrent = w.id === deployment?.workerId;
      const isOnline = w.state !== 'offline';
      const freeMem = w.resources?.freeMemoryMb ?? 0;
      const hasMemory = freeMem >= workloadMemoryMb;
      const activeCount = w.resources?.activeContainers ?? 0;
      const maxCount = w.limits?.maxConcurrentWorkloads ?? 4;
      const hasSlot = activeCount < maxCount;

      const totalMem = Math.max(w.resources?.totalMemoryMb ?? 8192, 1);
      const usedMem = Math.max(w.resources?.usedMemoryMb ?? 0, 0);
      const currentRatio = (usedMem / totalMem) * 100;
      const projectedRatio = ((usedMem + workloadMemoryMb) / totalMem) * 100;

      let rejectionReason: string | null = null;
      if (isCurrent) rejectionReason = 'Current host node';
      else if (!isOnline) rejectionReason = 'Host is currently offline';
      else if (!hasMemory) rejectionReason = `Insufficient free memory (${freeMem} MB free)`;
      else if (!hasSlot) rejectionReason = `Container concurrency limit reached (${maxCount}/${maxCount})`;

      return {
        worker: w,
        isCurrent,
        isOnline,
        eligible: !isCurrent && isOnline && hasMemory && hasSlot,
        rejectionReason,
        currentRatio,
        projectedRatio,
        freeMem,
        totalMem,
        activeCount,
        maxCount,
      };
    });
  }, [workers, deployment, workloadMemoryMb]);

  // Auto-pick lowest allocation eligible worker if none selected
  React.useEffect(() => {
    if (isOpen && deployment) {
      setErrorMessage(null);
      const eligibleOnes = candidateWorkers
        .filter((c) => c.eligible)
        .sort((a, b) => a.currentRatio - b.currentRatio);
      if (eligibleOnes.length > 0) {
        setSelectedTargetId(eligibleOnes[0].worker.id);
      } else {
        setSelectedTargetId('');
      }
    }
  }, [isOpen, deployment, candidateWorkers]);

  const relocateMutation = useMutation({
    mutationFn: async ({ depId, targetId }: { depId: string; targetId: string }) => {
      return api.relocateDeployment(depId, targetId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Relocation failed. Please try again.';
      setErrorMessage(msg);
    },
  });

  if (!isOpen || !deployment) return null;

  const selectedCandidate = candidateWorkers.find((c) => c.worker.id === selectedTargetId);

  // Source host projected reduction
  const sourceTotalMem = Math.max(sourceWorker?.resources?.totalMemoryMb ?? 8192, 1);
  const sourceUsedMem = Math.max(sourceWorker?.resources?.usedMemoryMb ?? 0, 0);
  const sourceCurrentRatio = (sourceUsedMem / sourceTotalMem) * 100;
  const sourceProjectedRatio = (Math.max(0, sourceUsedMem - workloadMemoryMb) / sourceTotalMem) * 100;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetId) return;
    setErrorMessage(null);
    relocateMutation.mutate({ depId: deployment.id, targetId: selectedTargetId });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-background/80 backdrop-blur-xs no-scrollbar overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-foreground animate-in fade-in-50 zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center text-foreground shrink-0">
              <ArrowLeftRight className="h-4 w-4" />
            </div>
            <div>
              <h2
                className="text-sm font-bold text-foreground"
                style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
              >
                Relocate Workload Container
              </h2>
              <p className="text-[11px] text-muted-foreground font-mono truncate">
                {deployment.id} • {deployment.applicationId}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 no-scrollbar">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Current Allocation Card */}
          <div className="p-3.5 rounded-xl border border-border bg-secondary/20 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5 text-muted-foreground" />
                Current Placement
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                Port {deployment.assignedPort || 'Dynamic'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
              <div className="p-2 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">Host Node</p>
                <p className="font-medium text-foreground truncate mt-0.5">
                  {sourceWorker?.name || deployment.workerId || 'Unassigned'}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">Workload RAM Cap</p>
                <p className="font-mono font-medium text-foreground mt-0.5">
                  {workloadMemoryMb} MB (Hard limit)
                </p>
              </div>
              <div className="p-2 rounded-lg bg-background border border-border">
                <p className="text-[10px] text-muted-foreground">Current Host Utilization</p>
                <p className="font-mono font-medium text-foreground mt-0.5">
                  {sourceCurrentRatio.toFixed(1)}% of {(sourceTotalMem / 1024).toFixed(0)} GB
                </p>
              </div>
            </div>
          </div>

          {/* Target Host Selector */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                Select Destination Worker Node
              </label>
              <span className="text-[10px] text-muted-foreground">
                Evaluated proportionally by available capacity
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {candidateWorkers.map((cand) => {
                const isSelected = selectedTargetId === cand.worker.id;
                const isEligible = cand.eligible;

                return (
                  <div
                    key={cand.worker.id}
                    onClick={() => {
                      if (isEligible) setSelectedTargetId(cand.worker.id);
                    }}
                    className={`p-3 rounded-xl border transition-all text-xs ${
                      isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : isEligible
                        ? 'border-border bg-card hover:bg-secondary/40 cursor-pointer'
                        : 'border-border/60 bg-secondary/15 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div
                          className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-muted-foreground/40'
                          }`}
                        >
                          {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-background" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground truncate">
                              {cand.worker.name}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-muted-foreground">
                              {cand.worker.ipAddress}
                            </span>
                            {cand.currentRatio < 30 && isEligible && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                Recommended (Headroom)
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Hardware Spec:{' '}
                            <span className="font-mono text-foreground">
                              {(cand.totalMem / 1024).toFixed(0)} GB RAM
                            </span>{' '}
                            • {cand.worker.resources?.cpuCount ?? 4} Cores • Free:{' '}
                            <span className="font-mono text-foreground">{cand.freeMem} MB</span>
                          </p>
                        </div>
                      </div>

                      {/* Right Side Badge / Rejection Reason */}
                      <div className="text-right shrink-0">
                        {!isEligible ? (
                          <span className="inline-block text-[10px] text-muted-foreground/80 font-mono px-2 py-0.5 rounded bg-secondary/80 border border-border">
                            {cand.rejectionReason}
                          </span>
                        ) : (
                          <div className="text-right font-mono">
                            <span className="text-[11px] text-foreground font-semibold">
                              {cand.currentRatio.toFixed(1)}% → {cand.projectedRatio.toFixed(1)}%
                            </span>
                            <p className="text-[10px] text-muted-foreground">Allocation Ratio</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar Showing Capacity Impact */}
                    {isEligible && (
                      <div className="mt-2.5 pt-2 border-t border-border/40 grid grid-cols-2 gap-3 text-[10px]">
                        <div>
                          <div className="flex justify-between text-muted-foreground mb-1">
                            <span>Projected Node Allocation:</span>
                            <span className="font-mono font-medium text-foreground">
                              {cand.projectedRatio.toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${Math.min(cand.projectedRatio, 100)}%` }}
                            />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-muted-foreground mb-1">
                            <span>Containers:</span>
                            <span className="font-mono text-foreground">
                              {cand.activeCount + 1} / {cand.maxCount} Max
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-muted-foreground rounded-full transition-all"
                              style={{
                                width: `${Math.min(((cand.activeCount + 1) / cand.maxCount) * 100, 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mathematical Proportional Fairness Notice */}
          <div className="p-3 rounded-lg bg-secondary/30 border border-border text-[11px] text-muted-foreground space-y-1">
            <div className="flex items-center gap-1.5 text-foreground font-semibold">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              <span>Proportional Cluster Capacity Weighting</span>
            </div>
            <p>
              Allocations are weighted against the physical hardware capacity of each node. A 512 MB
              allocation consumes <strong>3.1%</strong> of a 16 GB machine, but <strong>25.0%</strong> of a 2 GB
              machine. Relocating to higher-spec nodes prevents thin laptops from running out of headroom.
            </p>
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-2 flex items-center justify-between border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!selectedTargetId || relocateMutation.isPending}
              className="text-xs font-semibold flex items-center gap-1.5"
            >
              {relocateMutation.isPending ? (
                <>
                  <span className="h-3 w-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Relocating Workload...
                </>
              ) : (
                <>
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  <span>Confirm Relocation</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
