import { useQuery } from '@tanstack/react-query';
import {
  Cpu,
  HardDrive,
  Wifi,
  WifiOff,
  Activity,
  Server,
  Clock,
  Container,
} from 'lucide-react';
import { WorkerNode } from '@cloud-without-clouds/shared';
import { api } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

function WorkerStatusBadge({ state }: { state: WorkerNode['state'] }) {
  if (state === 'idle') {
    return (
      <Badge variant="success" className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Idle
      </Badge>
    );
  }
  if (state === 'busy') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
        <Activity className="h-3 w-3" />
        Busy
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
  const pct = Math.min(100, Math.round(value));
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
  const { data: workers = [], isLoading } = useQuery<WorkerNode[]>({
    queryKey: ['workers'],
    queryFn: () => api.getWorkers(),
    refetchInterval: 10000,
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1
          className="text-2xl font-bold tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
        >
          Worker Nodes
        </h1>
        <p className="text-sm text-muted-foreground">
          Connected laptops and desktop workstations contributing compute to the platform.
        </p>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Nodes Online', value: String(onlineCount), icon: Wifi },
          { label: 'Active Containers', value: String(totalContainers), icon: Container },
          { label: 'Total CPU Cores', value: String(totalCores), icon: Cpu },
          { label: 'Total RAM', value: `${totalRamGb} GB`, icon: HardDrive },
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

      {/* Worker Cards */}
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
      ) : workers.length === 0 ? (
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
              on a machine to register it as a compute node.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {workers.map((worker) => {
            const memUsedPct = worker.resources
              ? Math.round(
                  (worker.resources.usedMemoryMb / worker.resources.totalMemoryMb) * 100
                )
              : 0;
            const lastSeen = new Date(worker.lastHeartbeatAt);
            const secondsAgo = Math.round((Date.now() - lastSeen.getTime()) / 1000);

            return (
              <Card key={worker.id}>
                <CardHeader className="p-5 pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1 min-w-0">
                      <CardTitle className="text-sm font-semibold text-foreground">
                        {worker.name}
                      </CardTitle>
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
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
                        <Cpu className="h-3 w-3" />
                        CPU
                      </div>
                      <UsageBar value={worker.resources?.cpuUsagePercent ?? 0} />
                      <p className="text-[11px] text-muted-foreground">
                        {worker.resources?.cpuCount} cores available
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
                        <HardDrive className="h-3 w-3" />
                        Memory
                      </div>
                      <UsageBar value={memUsedPct} />
                      <p className="text-[11px] text-muted-foreground">
                        {((worker.resources?.usedMemoryMb ?? 0) / 1024).toFixed(1)} /{' '}
                        {((worker.resources?.totalMemoryMb ?? 0) / 1024).toFixed(0)} GB
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
                        <Container className="h-3 w-3" />
                        Containers
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        {worker.resources?.activeContainers ?? 0}
                        <span className="text-xs font-normal text-muted-foreground ml-1">
                          / {worker.limits?.maxConcurrentWorkloads ?? 4}
                        </span>
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Last Heartbeat
                      </div>
                      <p className="text-xs font-mono text-foreground">
                        {secondsAgo < 5 ? 'Just now' : `${secondsAgo}s ago`}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
