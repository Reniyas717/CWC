import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  X,
  AlertCircle,
  Check,
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
  memoryMb?: number;
}

export function RelocateWorkloadModal({
  deployment,
  workers,
  isOpen,
  onClose,
  onSuccess,
  memoryMb = 512,
}: RelocateWorkloadModalProps) {
  const queryClient = useQueryClient();
  const [selectedTargetId, setSelectedTargetId] = React.useState<string>('');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const workloadMemoryMb = memoryMb;

  // Source worker where the app is currently running
  const sourceWorker = React.useMemo(() => {
    if (!deployment?.workerId) return null;
    return workers.find((w) => w.id === deployment.workerId) || null;
  }, [deployment, workers]);

  // Candidate destination devices
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
      const currentLoadPct = Math.round((usedMem / totalMem) * 100);
      const projectedLoadPct = Math.round(((usedMem + workloadMemoryMb) / totalMem) * 100);

      let reason = '';
      if (isCurrent) reason = 'Already running here';
      else if (!isOnline) reason = 'Device is offline';
      else if (!hasMemory) reason = `Not enough free RAM (${(freeMem / 1024).toFixed(1)} GB free)`;
      else if (!hasSlot) reason = `Device is full (${maxCount}/${maxCount} apps)`;

      return {
        worker: w,
        isCurrent,
        isOnline,
        eligible: !isCurrent && isOnline && hasMemory && hasSlot,
        reason,
        currentLoadPct,
        projectedLoadPct,
        freeMemGb: (freeMem / 1024).toFixed(1),
        totalMemGb: (totalMem / 1024).toFixed(0),
        activeCount,
        maxCount,
      };
    });
  }, [workers, deployment, workloadMemoryMb]);

  // Pre-select best eligible candidate
  React.useEffect(() => {
    if (isOpen && deployment) {
      setErrorMessage(null);
      const eligibleOnes = candidateWorkers
        .filter((c) => c.eligible)
        .sort((a, b) => a.currentLoadPct - b.currentLoadPct);
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
      const msg = err instanceof Error ? err.message : 'Could not move app. Please try again.';
      setErrorMessage(msg);
    },
  });

  if (!isOpen || !deployment) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetId) return;
    setErrorMessage(null);
    relocateMutation.mutate({ depId: deployment.id, targetId: selectedTargetId });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs no-scrollbar overflow-y-auto">
      <div className="relative w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden text-foreground animate-in fade-in-50 zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/20">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-xs">
              <ArrowLeftRight className="h-4 w-4" />
            </div>
            <div>
              <h2
                className="text-base font-bold text-foreground"
                style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
              >
                Move App to Another Device
              </h2>
              <p className="text-xs text-muted-foreground">
                Relocate this app workload to balance device resources.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Current App Info Banner */}
          <div className="p-3.5 rounded-xl bg-secondary/30 border border-border flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground block font-mono">
                Selected Workload
              </span>
              <p className="font-bold text-foreground text-sm truncate mt-0.5 font-mono">
                {deployment.applicationId}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Uses <strong>512 MB RAM</strong> • Currently hosted on{' '}
                <span className="text-foreground font-medium">
                  {sourceWorker?.name || 'Unassigned'}
                </span>
              </p>
            </div>
            <span className="text-xs font-mono px-2 py-1 rounded-md bg-secondary border border-border text-foreground shrink-0">
              Port {deployment.assignedPort || '3000'}
            </span>
          </div>

          {/* Target Devices Selection */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-foreground block">
              Choose Destination Device:
            </label>

            <div className="space-y-2">
              {candidateWorkers.map((cand) => {
                const isSelected = selectedTargetId === cand.worker.id;
                const isEligible = cand.eligible;

                return (
                  <div
                    key={cand.worker.id}
                    onClick={() => {
                      if (isEligible) setSelectedTargetId(cand.worker.id);
                    }}
                    className={`p-3.5 rounded-xl border transition-all text-xs flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : isEligible
                        ? 'border-border bg-card hover:bg-secondary/40 cursor-pointer'
                        : 'border-border/40 bg-secondary/15 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/40'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground text-sm truncate">
                            {cand.worker.name}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-muted-foreground">
                            {cand.totalMemGb} GB RAM
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {cand.freeMemGb} GB free • Load: {cand.currentLoadPct}%{' '}
                          {isEligible && (
                            <span className="text-foreground font-medium">
                              → {cand.projectedLoadPct}% after move
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      {!isEligible ? (
                        <span className="text-[10px] text-muted-foreground/80 px-2 py-0.5 rounded bg-secondary/60 border border-border">
                          {cand.reason}
                        </span>
                      ) : cand.currentLoadPct < 30 ? (
                        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                          Recommended
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Simple Explanation Note */}
          <div className="p-3 rounded-xl bg-secondary/20 border border-border text-[11px] text-muted-foreground leading-relaxed">
            💡 <strong>How it works:</strong> The platform will pull this container on the selected
            device, verify that it passes health checks, and dynamically route incoming traffic to
            its new port without downtime.
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs cursor-pointer">
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!selectedTargetId || relocateMutation.isPending}
              className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              {relocateMutation.isPending ? (
                <>
                  <span className="h-3 w-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Moving App...
                </>
              ) : (
                <>
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  <span>Confirm & Move App</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
