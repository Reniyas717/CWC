import { Laptop, Cpu, HardDrive, Box, Power, RotateCcw } from 'lucide-react';
import { WorkerNode } from '@cloud-without-clouds/shared';
import { Card, CardContent } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { formatTimeAgo } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

export interface MobileWorkerCardProps {
  worker: WorkerNode;
  onSimulateDropout?: (workerId: string) => void;
  onSimulateReconnect?: (workerId: string) => void;
}

export function MobileWorkerCard({
  worker,
  onSimulateDropout,
  onSimulateReconnect,
}: MobileWorkerCardProps) {
  const isOffline = worker.state === 'offline';
  const totalMem = worker.resources?.totalMemoryMb || 16384;
  const usedMem = worker.resources?.usedMemoryMb || 4096;
  const memPct = Math.min(100, Math.round((usedMem / totalMem) * 100));
  const cpuPct = Math.min(100, Math.round(worker.resources?.cpuUsagePercent || 15));
  const activeContainers = worker.resources?.activeContainers || 0;
  const maxWorkloads = worker.limits?.maxConcurrentWorkloads || 4;

  return (
    <Card
      className={`border transition-all overflow-hidden ${
        isOffline
          ? 'border-destructive/30 bg-destructive/5 opacity-80'
          : 'border-border/80 bg-card active:border-emerald-500/40'
      }`}
    >
      <CardContent className="p-3.5 space-y-3">
        {/* Header: Node Name, Status, IP */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2.5">
            <div
              className={`h-9 w-9 rounded-xl flex items-center justify-center border ${
                isOffline
                  ? 'border-destructive/40 bg-destructive/15 text-destructive'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
              }`}
            >
              <Laptop className="h-4 w-4" />
            </div>
            <div>
              <h4 className="font-heading font-bold text-xs text-foreground line-clamp-1">
                {worker.name}
              </h4>
              <div className="flex items-center space-x-1.5 text-[10px] font-mono text-muted-foreground mt-0.5">
                <span>{worker.ipAddress || '100.x.y.z'}</span>
                <span>•</span>
                <span>
                  {worker.lastHeartbeat ? formatTimeAgo(worker.lastHeartbeat) : 'active'}
                </span>
              </div>
            </div>
          </div>

          <div>
            {isOffline ? (
              <Badge variant="destructive">● Offline</Badge>
            ) : worker.state === 'active' ? (
              <Badge variant="success">● Active</Badge>
            ) : (
              <Badge variant="secondary">● Idle</Badge>
            )}
          </div>
        </div>

        {/* Resource Telemetry Meters */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {/* Memory Bar */}
          <div className="p-2 rounded-xl bg-secondary/40 border border-border/50 space-y-1">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-muted-foreground flex items-center space-x-1">
                <HardDrive className="h-3 w-3" />
                <span>Memory</span>
              </span>
              <span className="font-mono font-bold text-foreground">{memPct}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  memPct > 85 ? 'bg-destructive' : memPct > 65 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${memPct}%` }}
              />
            </div>
            <div className="text-[9px] font-mono text-muted-foreground text-right">
              {usedMem}M / {totalMem}M
            </div>
          </div>

          {/* CPU Bar */}
          <div className="p-2 rounded-xl bg-secondary/40 border border-border/50 space-y-1">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-muted-foreground flex items-center space-x-1">
                <Cpu className="h-3 w-3" />
                <span>CPU Load</span>
              </span>
              <span className="font-mono font-bold text-foreground">{cpuPct}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  cpuPct > 85 ? 'bg-destructive' : cpuPct > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${cpuPct}%` }}
              />
            </div>
            <div className="text-[9px] font-mono text-muted-foreground text-right">
              {worker.resources?.cpuCount || 8} vCPUs
            </div>
          </div>
        </div>

        {/* Workloads and Protection Footer */}
        <div className="flex items-center justify-between text-xs pt-2 border-t border-border/50">
          <div className="flex items-center space-x-1.5 text-muted-foreground text-[11px]">
            <Box className="h-3.5 w-3.5 text-emerald-500" />
            <span className="font-medium text-foreground">
              {activeContainers} of {maxWorkloads}
            </span>
            <span className="text-[10px]">containers active</span>
          </div>

          {/* Chaos / Power toggle */}
          {isOffline ? (
            <Button
              variant="emerald"
              size="sm"
              onClick={() => {
                haptics.medium();
                onSimulateReconnect?.(worker.id);
              }}
              className="h-7 text-[10px] px-2 space-x-1"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reconnect</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                haptics.heavy();
                onSimulateDropout?.(worker.id);
              }}
              className="h-7 text-[10px] px-2 space-x-1 text-destructive hover:bg-destructive/10 hover:border-destructive/40"
            >
              <Power className="h-3 w-3" />
              <span>Simulate Dropout</span>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
