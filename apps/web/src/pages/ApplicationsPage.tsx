import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Layers,
  Plus,
  GitBranch,
  ExternalLink,
  RotateCw,
  Search,
  AlertCircle,
  Clock,
  Cpu,
  HardDrive,
  Terminal,
  StopCircle,
} from 'lucide-react';
import { AppConfig, AppFramework, Deployment } from '@cloud-without-clouds/shared';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { NewApplicationModal } from '@/components/applications/NewApplicationModal';
import { DeploymentLogsModal } from '@/components/deployments/DeploymentLogsModal';
import { DataError } from '@/components/ui/data-error';

export function ApplicationsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [selectedLogDep, setSelectedLogDep] = React.useState<Deployment | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedFramework, setSelectedFramework] = React.useState<string>('all');
  const [actionSuccess, setActionSuccess] = React.useState<string | null>(null);

  const {
    data: apps = [],
    isLoading,
    isError: isAppsError,
    error: appsError,
    refetch: refetchApps,
  } = useQuery<AppConfig[]>({
    queryKey: ['applications'],
    queryFn: () => api.getApplications(),
    refetchInterval: 10000,
  });

  const {
    data: deployments = [],
    isError: isDeploymentsError,
    error: deploymentsError,
  } = useQuery<Deployment[]>({
    queryKey: ['deployments'],
    queryFn: () => api.getDeployments(),
    refetchInterval: 5000,
  });

  const redeployMutation = useMutation({
    mutationFn: (appId: string) => api.triggerRedeploy(appId),
    onSuccess: (dep) => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      setActionSuccess(`Deployment ${dep.id} initiated on peer cluster.`);
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (error: Error) => setActionSuccess(`Redeploy failed: ${error.message}`),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelDeployment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] });
      setActionSuccess('Workload deployment cancelled.');
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (error: Error) => setActionSuccess(`Cancellation failed: ${error.message}`),
  });

  // Filter apps
  const filteredApps = apps.filter((app) => {
    const matchesSearch =
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.git.repositoryUrl.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFw = selectedFramework === 'all' || app.framework === selectedFramework;
    return matchesSearch && matchesFw;
  });

  // Metrics
  const totalReplicas = apps.reduce((sum, a) => sum + (a.replicas || 1), 0);
  const totalAllocatedRamMb = apps.reduce(
    (sum, a) => sum + (a.resourceLimits?.memoryLimitMb || 512) * (a.replicas || 1),
    0
  );

  const getLatestDeployment = (appId: string): Deployment | undefined => {
    return deployments.find((d) => d.applicationId === appId);
  };

  const getFrameworkBadge = (framework: AppFramework) => {
    switch (framework) {
      case 'nodejs':
        return (
          <Badge
            variant="outline"
            className="text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
          >
            Node.js
          </Badge>
        );
      case 'python':
        return (
          <Badge
            variant="outline"
            className="text-blue-600 dark:text-blue-400 border-blue-500/30 bg-blue-500/10"
          >
            Python
          </Badge>
        );
      case 'static':
        return (
          <Badge
            variant="outline"
            className="text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-500/10"
          >
            Static Web
          </Badge>
        );
      case 'dockerfile':
        return (
          <Badge
            variant="outline"
            className="text-sky-600 dark:text-sky-400 border-sky-500/30 bg-sky-500/10"
          >
            Dockerfile
          </Badge>
        );
      case 'go':
        return (
          <Badge
            variant="outline"
            className="text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10"
          >
            Go
          </Badge>
        );
      default:
        return <Badge variant="outline">{framework}</Badge>;
    }
  };

  const getDeploymentStatusBadge = (state?: string) => {
    switch (state) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Running
          </span>
        );
      case 'building':
      case 'deploying':
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="h-3 w-3 animate-spin text-amber-500" />
            {state}
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
            <AlertCircle className="h-3 w-3" />
            Failed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <StopCircle className="h-3 w-3" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-secondary text-secondary-foreground">
            Standby
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
          >
            Applications
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage containerized workloads scheduled across distributed peer workstations.
          </p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 shadow-2xs font-semibold h-9 text-xs"
        >
          <Plus className="h-4 w-4" />
          Deploy Application
        </Button>
      </div>

      {actionSuccess && (
        <div
          className={`p-3 border rounded-md text-xs flex items-center justify-between gap-2 ${actionSuccess.includes('failed') ? 'bg-destructive/10 border-destructive/20 text-destructive' : 'bg-secondary/80 border-border text-foreground'}`}
        >
          <span>{actionSuccess}</span>
          <span className="text-[10px] font-mono text-muted-foreground">Cluster Sync</span>
        </div>
      )}

      {isAppsError ? (
        <DataError error={appsError} onRetry={() => void refetchApps()} />
      ) : isDeploymentsError ? (
        <DataError title="Unable to load deployment state" error={deploymentsError} />
      ) : null}

      {/* Summary Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Registered Workloads
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-xl font-bold text-foreground">{apps.length}</div>
            <p className="text-[11px] text-muted-foreground">Configured Git repositories</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Active Replicas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-xl font-bold text-foreground">{totalReplicas}</div>
            <p className="text-[11px] text-muted-foreground">Distributed container tasks</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Aggregated RAM Cap
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-xl font-bold text-foreground">
              {(totalAllocatedRamMb / 1024).toFixed(1)} GB
            </div>
            <p className="text-[11px] text-muted-foreground">Peer memory reserved</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Ingress Gateway
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-xl font-bold text-foreground">Caddy + Quick Tunnel</div>
            <p className="text-[11px] text-muted-foreground">Dynamic upstream proxy</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card p-2.5 rounded-lg border border-border">
        <div className="relative w-full sm:w-72">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search applications or repositories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs bg-background"
          />
        </div>

        <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto text-xs no-scrollbar">
          {['all', 'nodejs', 'static', 'dockerfile', 'python', 'go'].map((fw) => (
            <button
              key={fw}
              type="button"
              onClick={() => setSelectedFramework(fw)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer shrink-0 ${
                selectedFramework === fw
                  ? 'bg-primary text-primary-foreground shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {fw}
            </button>
          ))}
        </div>
      </div>

      {/* Applications List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <div className="flex items-center justify-between mb-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-4 w-72 mb-2" />
              <div className="flex gap-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-32" />
              </div>
            </Card>
          ))}
        </div>
      ) : filteredApps.length === 0 ? (
        <Card className="border border-dashed border-border p-10 text-center">
          <div className="max-w-md mx-auto space-y-3">
            <div className="h-10 w-10 rounded-full bg-secondary text-foreground flex items-center justify-center mx-auto">
              <Layers className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">No Matching Applications</CardTitle>
            <p className="text-xs text-muted-foreground">
              Deploy your first Git repository to begin distributing container workloads across
              connected developer laptops.
            </p>
            <Button onClick={() => setIsModalOpen(true)} size="sm" className="mt-2 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Deploy Application
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredApps.map((app) => {
            const latestDep = getLatestDeployment(app.id);
            const isTerminal =
              !latestDep ||
              latestDep.state === 'stopped' ||
              latestDep.state === 'failed' ||
              latestDep.state === 'cancelled';

            return (
              <Card key={app.id} className="hover:border-foreground/20 transition-all">
                <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: App Identity & Git Source */}
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-semibold text-sm sm:text-base text-foreground">
                        {app.name}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                        /{app.slug}
                      </span>
                      {getFrameworkBadge(app.framework)}
                      {getDeploymentStatusBadge(latestDep?.state)}
                    </div>

                    {/* Git Details */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <a
                        href={app.git.repositoryUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 hover:text-foreground transition-colors font-mono"
                      >
                        <GitBranch className="h-3.5 w-3.5" />
                        <span className="truncate max-w-xs">{app.git.repositoryUrl}</span>
                        <span className="bg-secondary px-1.5 py-0.2 rounded text-[11px]">
                          {app.git.branch}
                        </span>
                      </a>

                      <span>•</span>

                      <span className="flex items-center gap-1">
                        <Cpu className="h-3 w-3 opacity-70" />
                        {app.resourceLimits?.cpuLimitCores || 1.0} Core
                      </span>

                      <span>•</span>

                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3 w-3 opacity-70" />
                        {app.resourceLimits?.memoryLimitMb || 512} MB
                      </span>

                      <span>•</span>

                      <span>{app.replicas || 1} Replicas</span>

                      <span>•</span>

                      <span>Port {app.port}</span>
                    </div>

                    {/* Live Public URL */}
                    {latestDep?.routingStatus === 'ready' && latestDep.publicUrl && (
                      <div className="pt-1 flex items-center gap-2 flex-wrap">
                        <a
                          href={latestDep.publicUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-foreground font-mono hover:underline"
                        >
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          {latestDep.publicUrl}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </a>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          (Port {latestDep.assignedPort})
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {latestDep && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedLogDep(latestDep)}
                        className="text-xs h-8 px-2.5 flex items-center gap-1.5"
                      >
                        <Terminal className="h-3 w-3" />
                        <span>Logs</span>
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => redeployMutation.mutate(app.id)}
                      disabled={redeployMutation.isPending}
                      className="text-xs h-8 px-2.5 flex items-center gap-1"
                    >
                      <RotateCw
                        className={`h-3 w-3 ${redeployMutation.isPending ? 'animate-spin' : ''}`}
                      />
                      <span>Redeploy</span>
                    </Button>

                    {!isTerminal && latestDep && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelMutation.mutate(latestDep.id)}
                        disabled={cancelMutation.isPending}
                        className="text-xs h-8 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Cancel active build or container"
                      >
                        <StopCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Application Deployment Modal */}
      <NewApplicationModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      {/* Terminal Log Viewer Modal */}
      <DeploymentLogsModal
        deployment={selectedLogDep}
        isOpen={!!selectedLogDep}
        onClose={() => setSelectedLogDep(null)}
      />
    </div>
  );
}
