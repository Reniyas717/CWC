import { useQuery } from '@tanstack/react-query';
import {
  Terminal,
  GitBranch,
  Rocket,
  ExternalLink,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader,
  Container,
} from 'lucide-react';
import { Deployment } from '@cloud-without-clouds/shared';
import { api } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function DeploymentStateBadge({ state }: { state: Deployment['state'] }) {
  if (state === 'running') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Running
      </span>
    );
  }
  if (state === 'building' || state === 'deploying' || state === 'queued') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
        <Loader className="h-3 w-3 animate-spin" />
        {state.charAt(0).toUpperCase() + state.slice(1)}
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
        <AlertCircle className="h-3 w-3" />
        Failed
      </span>
    );
  }
  if (state === 'stopped' || state === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-secondary text-muted-foreground border border-border">
        <CheckCircle2 className="h-3 w-3" />
        {state.charAt(0).toUpperCase() + state.slice(1)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-secondary text-secondary-foreground">
      {state}
    </span>
  );
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function DeploymentsPage() {
  const { data: deployments = [], isLoading } = useQuery<Deployment[]>({
    queryKey: ['deployments'],
    queryFn: () => api.getDeployments(),
    refetchInterval: 10000,
  });

  const runningCount = deployments.filter((d) => d.state === 'running').length;
  const failedCount = deployments.filter((d) => d.state === 'failed').length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1
          className="text-2xl font-bold tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
        >
          Deployments
        </h1>
        <p className="text-sm text-muted-foreground">
          Live build logs and containerised workload history across all peer worker nodes.
        </p>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Deployments', value: String(deployments.length), icon: Rocket },
          { label: 'Running', value: String(runningCount), icon: Container },
          { label: 'Failed', value: String(failedCount), icon: AlertCircle },
          {
            label: 'Last Deploy',
            value:
              deployments.length > 0
                ? timeAgo(
                    deployments.reduce((latest, d) =>
                      d.createdAt > latest.createdAt ? d : latest
                    ).createdAt
                  )
                : '—',
            icon: Clock,
          },
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

      {/* Deployment List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <div className="flex items-center justify-between mb-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-4 w-72 mb-2" />
              <Skeleton className="h-4 w-56" />
            </Card>
          ))}
        </div>
      ) : deployments.length === 0 ? (
        <Card className="border border-dashed border-border p-10 text-center">
          <div className="max-w-sm mx-auto space-y-3">
            <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center mx-auto">
              <Terminal className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No Deployments Yet</p>
            <p className="text-xs text-muted-foreground">
              Trigger a deployment from the Applications page once worker nodes are connected.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {deployments.map((dep) => (
            <Card key={dep.id}>
              <CardHeader className="p-5 pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1 min-w-0">
                    <CardTitle className="text-sm font-semibold text-foreground font-mono">
                      {dep.id}
                    </CardTitle>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono flex-wrap">
                      <GitBranch className="h-3 w-3" />
                      <span>{dep.gitBranch}</span>
                      <span>@</span>
                      <span className="bg-secondary px-1.5 py-0.5 rounded">{dep.gitCommitHash}</span>
                      <span>•</span>
                      <span>v{dep.version}</span>
                      <span>•</span>
                      <span>{timeAgo(dep.createdAt)}</span>
                    </div>
                  </div>
                  <DeploymentStateBadge state={dep.state} />
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-[11px]">
                  <div className="space-y-0.5">
                    <span className="text-muted-foreground uppercase tracking-wide font-medium">
                      Worker
                    </span>
                    <p className="font-mono text-foreground">{dep.workerId ?? '—'}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-muted-foreground uppercase tracking-wide font-medium">
                      Container
                    </span>
                    <p className="font-mono text-foreground">{dep.containerId ?? '—'}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-muted-foreground uppercase tracking-wide font-medium">
                      Port
                    </span>
                    <p className="font-mono text-foreground">{dep.assignedPort ?? '—'}</p>
                  </div>
                </div>

                {dep.publicUrl && (
                  <div className="pt-2 border-t border-border">
                    <a
                      href={dep.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-mono text-foreground hover:underline"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {dep.publicUrl}
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
