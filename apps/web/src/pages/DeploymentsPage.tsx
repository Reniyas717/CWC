import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Terminal,
  GitBranch,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Loader,
  Container,
  Layers,
  StopCircle,
  Search,
  Filter,
  X,
} from 'lucide-react';
import { Deployment } from '@cloud-without-clouds/shared';
import { api } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { DeploymentLogsModal } from '@/components/deployments/DeploymentLogsModal';
import { AnimatedPipeline } from '@/components/deployments/AnimatedPipeline';
import { DataError } from '@/components/ui/data-error';

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
  if (state === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
        <StopCircle className="h-3 w-3" />
        Cancelled
      </span>
    );
  }
  if (state === 'stopped') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-secondary text-muted-foreground border border-border">
        <CheckCircle2 className="h-3 w-3" />
        Stopped
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-secondary text-secondary-foreground">
      {state}
    </span>
  );
}

function RoutingStatusBadge({ deployment }: { deployment: Deployment }) {
  if (deployment.routingStatus === 'ready' && deployment.publicUrl) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Public route ready
      </span>
    );
  }
  if (deployment.routingStatus === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-destructive">
        <AlertCircle className="h-3 w-3" />
        Route failed{deployment.routingError ? `: ${deployment.routingError}` : ''}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
      <Loader className="h-3 w-3 animate-spin" />
      Publishing public routeâ€¦
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
  const queryClient = useQueryClient();
  const [selectedLogDep, setSelectedLogDep] = React.useState<Deployment | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [stateFilter, setStateFilter] = React.useState<string>('all');
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(5);

  const {
    data: deployments = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Deployment[]>({
    queryKey: ['deployments'],
    queryFn: () => api.getDeployments(),
    refetchInterval: 5000,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelDeployment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
    },
  });

  const runningCount = deployments.filter((d) => d.state === 'running').length;
  const failedCount = deployments.filter((d) => d.state === 'failed').length;
  const activeIngressCount = deployments.filter(
    (d) => d.state === 'running' && d.routingStatus === 'ready' && !!d.publicUrl
  ).length;

  // Filter deployments
  const filteredDeployments = React.useMemo(() => {
    return deployments.filter((dep) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        dep.id.toLowerCase().includes(q) ||
        dep.applicationId.toLowerCase().includes(q) ||
        (dep.workerId && dep.workerId.toLowerCase().includes(q)) ||
        dep.gitBranch.toLowerCase().includes(q) ||
        (dep.gitCommitHash && dep.gitCommitHash.toLowerCase().includes(q));

      const matchesState = stateFilter === 'all' || dep.state === stateFilter;
      return matchesSearch && matchesState;
    });
  }, [deployments, searchQuery, stateFilter]);

  // Sliced page items
  const paginatedDeployments = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDeployments.slice(start, start + pageSize);
  }, [filteredDeployments, currentPage, pageSize]);

  // Reset to page 1 on search or filter change
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const handleStateFilterChange = (val: string) => {
    setStateFilter(val);
    setCurrentPage(1);
  };

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
          Live build logs, worker container lifecycle, and dynamic edge route assignments.
        </p>
      </div>

      {isError && <DataError error={error} onRetry={() => void refetch()} />}

      {cancelMutation.isError && (
        <DataError title="Deployment cancellation failed" error={cancelMutation.error} />
      )}

      {/* Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Deployments', value: String(deployments.length), icon: Layers },
          { label: 'Active Containers', value: String(runningCount), icon: Container },
          { label: 'Ingress Tunnels', value: String(activeIngressCount), icon: ExternalLink },
          {
            label: 'Failed / Error',
            value: String(failedCount),
            icon: AlertCircle,
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

      {/* Animated SVG Deployment Execution Pipeline */}
      <div className="rounded-md border border-border bg-card p-4 space-y-2">
        <AnimatedPipeline
          currentStage={runningCount > 0 ? 'ingress' : 'git'}
          status={failedCount > 0 ? 'failed' : runningCount > 0 ? 'running' : 'idle'}
        />
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search deployments by ID, app, worker, or git..."
            className="pl-9 pr-8 h-8.5 text-xs bg-card"
          />
          {searchQuery && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* State Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'All' },
            { id: 'running', label: 'Running' },
            { id: 'building', label: 'Building' },
            { id: 'failed', label: 'Failed' },
            { id: 'cancelled', label: 'Cancelled' },
          ].map((st) => {
            const isActive = stateFilter === st.id;
            return (
              <button
                key={st.id}
                onClick={() => handleStateFilterChange(st.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                    : 'bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                {st.label}
              </button>
            );
          })}
        </div>
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
      ) : isError ? null : deployments.length === 0 ? (
        <Card className="border border-dashed border-border p-10 text-center">
          <div className="max-w-sm mx-auto space-y-3">
            <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center mx-auto">
              <Terminal className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No Deployments Found</p>
            <p className="text-xs text-muted-foreground">
              Queue a deployment from the Applications page to trigger least-loaded placement across
              peer nodes.
            </p>
          </div>
        </Card>
      ) : filteredDeployments.length === 0 ? (
        <Card className="border border-dashed border-border p-8 text-center">
          <div className="max-w-sm mx-auto space-y-2">
            <Filter className="h-8 w-8 text-muted-foreground mx-auto opacity-50" />
            <p className="text-sm font-semibold text-foreground">No Matching Deployments</p>
            <p className="text-xs text-muted-foreground">
              No deployments match your search filter "{searchQuery || stateFilter}".
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                handleSearchChange('');
                handleStateFilterChange('all');
              }}
              className="mt-2 text-xs"
            >
              Reset Filters
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            {paginatedDeployments.map((dep) => {
              const isTerminal =
                dep.state === 'stopped' || dep.state === 'failed' || dep.state === 'cancelled';
              const isCancelling = cancelMutation.isPending && cancelMutation.variables === dep.id;

              return (
                <Card key={dep.id} className="hover:border-foreground/20 transition-all">
                  <CardHeader className="p-5 pb-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-sm font-semibold text-foreground font-mono">
                            {dep.id}
                          </CardTitle>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                            {dep.applicationId}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono flex-wrap">
                          <GitBranch className="h-3 w-3" />
                          <span>{dep.gitBranch}</span>
                          <span>@</span>
                          <span className="bg-secondary px-1.5 py-0.2 rounded">
                            {dep.gitCommitHash || 'head'}
                          </span>
                          <span>â€¢</span>
                          <span>v{dep.version}</span>
                          <span>â€¢</span>
                          <span>{timeAgo(dep.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <DeploymentStateBadge state={dep.state} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-[11px]">
                      <div className="space-y-0.5">
                        <span className="text-muted-foreground uppercase tracking-wide font-medium text-[10px]">
                          Target Worker
                        </span>
                        <p className="font-mono text-foreground truncate">
                          {dep.workerId ?? 'Auto-selecting...'}
                        </p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-muted-foreground uppercase tracking-wide font-medium text-[10px]">
                          Container ID
                        </span>
                        <p className="font-mono text-foreground truncate">
                          {dep.containerId ?? 'Pending runtime...'}
                        </p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-muted-foreground uppercase tracking-wide font-medium text-[10px]">
                          Assigned Host Port
                        </span>
                        <p className="font-mono text-foreground">
                          {dep.assignedPort ? `:${dep.assignedPort}` : 'Ephemeral (-p 0:port)'}
                        </p>
                      </div>
                    </div>

                    {/* Public URL and Row Actions */}
                    <div className="pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        {dep.routingStatus === 'ready' && dep.publicUrl ? (
                          <a
                            href={dep.publicUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-mono text-foreground hover:underline"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>{dep.publicUrl}</span>
                            <ExternalLink className="h-3 w-3 opacity-60" />
                          </a>
                        ) : null}
                        <RoutingStatusBadge deployment={dep} />
                      </div>

                      {/* Action Buttons: View Logs & Cancel */}
                      <div className="flex items-center gap-2 ml-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedLogDep(dep)}
                          className="h-7.5 px-2.5 text-xs flex items-center gap-1.5"
                        >
                          <Terminal className="h-3 w-3" />
                          <span>View Logs</span>
                        </Button>

                        {!isTerminal && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => cancelMutation.mutate(dep.id)}
                            disabled={isCancelling}
                            className="h-7.5 px-2.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <StopCircle className="h-3 w-3" />
                            <span>{isCancelling ? 'Cancelling...' : 'Cancel'}</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination Controls */}
          <Pagination
            currentPage={currentPage}
            totalItems={filteredDeployments.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[5, 10, 20, 50]}
            itemLabel="deployments"
            className="pt-2 border-t border-border/50"
          />
        </div>
      )}

      {/* Terminal Log Viewer Modal */}
      <DeploymentLogsModal
        deployment={selectedLogDep}
        isOpen={!!selectedLogDep}
        onClose={() => setSelectedLogDep(null)}
      />
    </div>
  );
}
