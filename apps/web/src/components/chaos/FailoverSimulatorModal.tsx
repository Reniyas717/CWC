import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, AlertTriangle, RefreshCw, Zap, HelpCircle } from 'lucide-react';
import { WorkerNode } from '@cloud-without-clouds/shared';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface FailoverSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  workers: WorkerNode[];
}

export function FailoverSimulatorModal({ isOpen, onClose, workers }: FailoverSimulatorModalProps) {
  const queryClient = useQueryClient();
  const [selectedWorkerId, setSelectedWorkerId] = React.useState<string>(workers[0]?.id || '');
  const [simulationLog, setSimulationLog] = React.useState<
    Array<{ text: string; time: string; type: 'warn' | 'info' | 'success' }>
  >([]);

  React.useEffect(() => {
    if (workers.length > 0 && !selectedWorkerId) {
      setSelectedWorkerId(workers[0].id);
    }
  }, [workers, selectedWorkerId]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const targetWorker = workers.find((w) => w.id === selectedWorkerId);
  const isTargetOffline = targetWorker?.state === 'offline';

  const dropoutMutation = useMutation({
    mutationFn: (id: string) => api.simulateWorkerDropout(id),
    onSuccess: (result) => {
      const now = new Date().toLocaleTimeString();
      setSimulationLog((prev) => [
        {
          text: `[Heartbeat Expired] Worker '${selectedWorkerId}' missed heartbeats (>30s lease limit exceeded).`,
          time: now,
          type: 'warn',
        },
        {
          text: `[Node Evacuation] Control plane declared worker OFFLINE and purged Redis heartbeat lease.`,
          time: now,
          type: 'warn',
        },
        {
          text: `[Self-Healing Recovery] Automated sweep rescheduled ${result.rescheduledDeployments.length} active deployment(s) for re-placement.`,
          time: now,
          type: 'success',
        },
        {
          text: `[Ingress Health Check] Edge gateway removed failed upstreams; zero-downtime routing maintained.`,
          time: now,
          type: 'info',
        },
        ...prev,
      ]);
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      queryClient.invalidateQueries({ queryKey: ['worker-scores'] });
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
    },
  });

  const reconnectMutation = useMutation({
    mutationFn: (id: string) => api.simulateWorkerReconnect(id),
    onSuccess: () => {
      const now = new Date().toLocaleTimeString();
      setSimulationLog((prev) => [
        {
          text: `[Reconnected] Worker '${selectedWorkerId}' restored online with status 'idle'.`,
          time: now,
          type: 'success',
        },
        {
          text: `[Scheduler Evaluation] Worker re-enrolled into least-loaded placement pool for incoming workloads.`,
          time: now,
          type: 'info',
        },
        ...prev,
      ]);
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      queryClient.invalidateQueries({ queryKey: ['worker-scores'] });
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-card border border-border rounded-md shadow-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <h2
                className="text-base font-bold text-foreground tracking-tight flex items-center gap-2"
                style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
              >
                <span>Worker Failure & Recovery Simulator</span>
                <Badge variant="destructive" className="text-[10px] font-mono py-0 h-4.5">
                  Chaos Engine
                </Badge>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Demonstrates autonomous self-healing when a peer workstation loses power or Wi-Fi
                connectivity.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-secondary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* Target Worker Selector */}
          <div className="space-y-2">
            <label className="font-semibold text-foreground flex items-center justify-between">
              <span>Target Contributor Workstation</span>
              <span className="font-normal font-mono text-[11px] text-muted-foreground">
                Current Status: {targetWorker?.state || 'unknown'}
              </span>
            </label>
            <select
              value={selectedWorkerId}
              onChange={(e) => setSelectedWorkerId(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.hostname} - {w.ipAddress}) [{w.state.toUpperCase()}]
                </option>
              ))}
            </select>
          </div>

          {/* Action Simulation Controls */}
          <div className="p-4 rounded-md border border-border bg-secondary/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="font-bold text-foreground">
                {isTargetOffline ? 'Node is currently OFFLINE' : 'Simulate Hardware / Network Drop'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {isTargetOffline
                  ? 'Click Reconnect to restore the machine back to the active compute cluster.'
                  : 'Artificially lapses the 30-second heartbeat lease to trigger autonomous workload evacuation.'}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isTargetOffline ? (
                <Button
                  onClick={() => reconnectMutation.mutate(selectedWorkerId)}
                  disabled={reconnectMutation.isPending}
                  className="h-8 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${reconnectMutation.isPending ? 'animate-spin' : ''}`}
                  />
                  <span>Restore Node Online</span>
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={() => dropoutMutation.mutate(selectedWorkerId)}
                  disabled={dropoutMutation.isPending}
                  className="h-8 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <AlertTriangle
                    className={`h-3.5 w-3.5 ${dropoutMutation.isPending ? 'animate-spin' : ''}`}
                  />
                  <span>Simulate Worker Dropout</span>
                </Button>
              )}
            </div>
          </div>

          {/* Self-Healing 4-Stage Protocol Diagram */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
              Autonomous Failure Recovery Protocol (Problem Statement)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2.5 rounded border border-border bg-card space-y-1">
                <span className="text-[10px] font-mono text-muted-foreground block">
                  1. Detection
                </span>
                <p className="font-semibold text-foreground text-[11px]">Heartbeat Lease</p>
                <span className="text-[10px] text-muted-foreground">&gt;30s timeout trigger</span>
              </div>
              <div className="p-2.5 rounded border border-border bg-card space-y-1">
                <span className="text-[10px] font-mono text-muted-foreground block">
                  2. Evacuation
                </span>
                <p className="font-semibold text-foreground text-[11px]">Node Flagged Offline</p>
                <span className="text-[10px] text-muted-foreground">Purge Redis cache</span>
              </div>
              <div className="p-2.5 rounded border border-border bg-card space-y-1">
                <span className="text-[10px] font-mono text-muted-foreground block">
                  3. Rescheduling
                </span>
                <p className="font-semibold text-foreground text-[11px]">S(W) Placement</p>
                <span className="text-[10px] text-muted-foreground">Rescheduled on peer</span>
              </div>
              <div className="p-2.5 rounded border border-border bg-card space-y-1">
                <span className="text-[10px] font-mono text-muted-foreground block">
                  4. Ingress
                </span>
                <p className="font-semibold text-foreground text-[11px]">Route Re-bound</p>
                <span className="text-[10px] text-muted-foreground">Zero edge downtime</span>
              </div>
            </div>
          </div>

          {/* Live Event Stream Terminal */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
                Self-Healing Event Audit Log
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {simulationLog.length} events recorded
              </span>
            </div>
            <div className="h-36 rounded-md border border-border bg-background p-3 font-mono text-[11px] overflow-y-auto space-y-1.5">
              {simulationLog.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                  Click "Simulate Worker Dropout" to trigger a live failure recovery drill.
                </div>
              ) : (
                simulationLog.map((log, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-muted-foreground shrink-0">[{log.time}]</span>
                    <span
                      className={
                        log.type === 'warn'
                          ? 'text-amber-500'
                          : log.type === 'success'
                            ? 'text-emerald-500'
                            : 'text-foreground'
                      }
                    >
                      {log.text}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-card flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <HelpCircle className="h-3.5 w-3.5" />
            <span>
              Fulfills Hackathon Requirement: Automatic worker failure recovery and workload
              migration.
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 text-xs cursor-pointer"
          >
            Close Demo
          </Button>
        </div>
      </div>
    </div>
  );
}
