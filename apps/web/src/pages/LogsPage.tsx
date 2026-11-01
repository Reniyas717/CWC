import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Terminal,
  RotateCw,
  Search,
  Copy,
  Check,
  Download,
  Filter,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { Deployment, DeploymentLogEntry } from '@cloud-without-clouds/shared';
import { api } from '@/services/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { DataError } from '@/components/ui/data-error';

export function LogsPage() {
  const [selectedDeploymentId, setSelectedDeploymentId] = React.useState<string>('all');
  const [streamFilter, setStreamFilter] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [autoScroll, setAutoScroll] = React.useState(true);
  const [isCopied, setIsCopied] = React.useState(false);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const terminalEndRef = React.useRef<HTMLDivElement>(null);

  // Fetch all deployments
  const {
    data: deployments = [],
    isError: isDeploymentsError,
    error: deploymentsError,
    refetch: refetchDeployments,
  } = useQuery<Deployment[]>({
    queryKey: ['deployments'],
    queryFn: () => api.getDeployments(),
    refetchInterval: 5000,
  });

  // Fetch logs for the selected deployment or the first deployment
  const activeDep =
    selectedDeploymentId === 'all'
      ? deployments[0]
      : deployments.find((d) => d.id === selectedDeploymentId) || deployments[0];

  const isTailPolling =
    Boolean(activeDep) && (activeDep?.state === 'running' || activeDep?.state === 'building');

  const {
    data: logs = [],
    isLoading,
    isFetching,
    isError: isLogsError,
    error: logsError,
    refetch,
  } = useQuery<DeploymentLogEntry[]>({
    queryKey: ['deployment-logs', activeDep?.id],
    queryFn: () => (activeDep ? api.getDeploymentLogs(activeDep.id) : Promise.resolve([])),
    enabled: !!activeDep,
    refetchInterval:
      activeDep?.state === 'running' || activeDep?.state === 'building' ? 3000 : false,
  });

  // Filter logs
  const filteredLogs = React.useMemo(() => {
    return logs.filter((log) => {
      const matchesStream = streamFilter === 'all' || log.stream === streamFilter;
      const matchesSearch =
        !searchQuery ||
        log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.level.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStream && matchesSearch;
    });
  }, [logs, streamFilter, searchQuery]);

  // Paginated log slice
  const paginatedLogs = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const handleStreamFilterChange = (val: string) => {
    setStreamFilter(val);
    setCurrentPage(1);
  };

  const tailStatus =
    isDeploymentsError || isLogsError
      ? 'Unavailable'
      : isLoading
        ? 'Connecting'
        : isTailPolling
          ? 'Polling'
          : activeDep
            ? 'Idle'
            : 'No deployment';

  // Auto-scroll
  React.useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs, autoScroll]);

  const handleCopyLogs = () => {
    const text = filteredLogs
      .map(
        (l) =>
          `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.stream.toUpperCase()}] [${l.level.toUpperCase()}] ${l.message}`
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleDownloadLogs = () => {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.stream}] [${l.level}] ${l.message}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeDep?.id || 'cluster'}-logs.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1
            className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5"
            style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
          >
            <Terminal className="h-6 w-6 text-foreground" />
            <span>Cluster Terminal & Logs</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Live stdout, stderr, and system lifecycle streams from distributed container workloads.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8.5 text-xs flex items-center gap-1.5"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyLogs}
            className="h-8.5 text-xs flex items-center gap-1.5"
          >
            {isCopied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{isCopied ? 'Copied' : 'Copy'}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadLogs}
            className="h-8.5 text-xs flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export</span>
          </Button>
        </div>
      </div>

      {isDeploymentsError && (
        <DataError
          title="Unable to load deployments"
          error={deploymentsError}
          onRetry={() => void refetchDeployments()}
        />
      )}
      {isLogsError && (
        <DataError
          title="Unable to load deployment logs"
          error={logsError}
          onRetry={() => void refetch()}
        />
      )}

      {/* Main Terminal Shell */}
      <Card className="overflow-hidden border border-border shadow-md flex flex-col h-[74vh]">
        {/* Terminal Header & Workload Selector */}
        <div className="p-3.5 px-5 bg-card border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
          {/* Workload Select Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar text-xs">
            <span className="text-muted-foreground font-mono text-[11px] uppercase tracking-wider shrink-0">
              Workload:
            </span>
            {deployments.length === 0 ? (
              <span className="text-muted-foreground italic text-xs">No active deployments</span>
            ) : (
              deployments.map((dep) => (
                <button
                  key={dep.id}
                  type="button"
                  onClick={() => setSelectedDeploymentId(dep.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all cursor-pointer flex items-center gap-1.5 shrink-0 border ${
                    (selectedDeploymentId === 'all' && dep === activeDep) ||
                    selectedDeploymentId === dep.id
                      ? 'bg-foreground text-background border-foreground font-semibold shadow-2xs'
                      : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      dep.state === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                    }`}
                  />
                  <span>{dep.applicationId}</span>
                  <span className="text-[10px] opacity-70">({dep.id.slice(0, 8)})</span>
                </button>
              ))
            )}
          </div>

          {/* Active Workload Summary Pill */}
          {activeDep && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono shrink-0">
              <span>
                Node: <strong className="text-foreground">{activeDep.workerId || 'auto'}</strong>
              </span>
              <span>•</span>
              <span>Port :{activeDep.assignedPort || 'ephemeral'}</span>
              {activeDep.routingStatus === 'ready' && activeDep.publicUrl && (
                <>
                  <span>•</span>
                  <a
                    href={activeDep.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground hover:underline inline-flex items-center gap-1 font-sans"
                  >
                    <span>Tunnel</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              )}
            </div>
          )}
        </div>

        {/* Filter Strip: Streams, Search, and Auto-Scroll */}
        <div className="p-2.5 px-5 bg-secondary/30 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 text-xs">
          {/* Stream Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <span className="text-muted-foreground font-mono text-[11px] flex items-center gap-1 mr-1.5">
              <Filter className="h-3 w-3" />
              Stream:
            </span>
            {['all', 'stdout', 'stderr', 'system'].map((stream) => (
              <button
                key={stream}
                type="button"
                onClick={() => handleStreamFilterChange(stream)}
                className={`px-2.5 py-0.5 rounded text-[11px] font-mono capitalize transition-colors cursor-pointer border ${
                  streamFilter === stream
                    ? 'bg-primary text-primary-foreground border-primary font-semibold'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                {stream}
              </button>
            ))}
          </div>

          {/* Search Box & Auto-Scroll Button */}
          <div className="flex items-center gap-2">
            <div className="relative w-48 sm:w-60">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-2 text-muted-foreground" />
              <Input
                placeholder="Filter terminal output..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="h-7.5 text-xs pl-8 font-mono bg-background"
              />
            </div>
            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer border ${
                autoScroll
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-semibold'
                  : 'bg-secondary text-muted-foreground border-border'
              }`}
            >
              Auto-Scroll: {autoScroll ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        {/* Live Terminal Screen */}
        <div className="flex-1 bg-secondary/15 dark:bg-black/60 p-4 font-mono text-xs overflow-y-auto no-scrollbar space-y-1 select-text">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
              <RotateCw className="h-4 w-4 animate-spin" />
              <span>Attaching to container log stream...</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-2">
              <Terminal className="h-8 w-8 opacity-40" />
              <p className="text-sm font-medium">No log entries matched your filter.</p>
              <p className="text-xs text-muted-foreground/70">
                Worker agents stream stdout/stderr automatically upon task assignment.
              </p>
            </div>
          ) : (
            paginatedLogs.map((log, idx) => {
              const lineNumber = (currentPage - 1) * pageSize + idx + 1;
              const timeStr = new Date(log.timestamp).toLocaleTimeString();
              const levelColor =
                log.level === 'error'
                  ? 'text-destructive font-semibold'
                  : log.level === 'warn'
                    ? 'text-amber-600 dark:text-amber-400'
                    : log.stream === 'system'
                      ? 'text-sky-600 dark:text-sky-400'
                      : 'text-foreground';

              return (
                <div
                  key={log.id || idx}
                  className="flex items-start gap-3 hover:bg-secondary/40 py-0.5 px-2 rounded transition-colors group leading-relaxed"
                >
                  <span className="text-[10px] text-muted-foreground/50 w-7 text-right select-none shrink-0 pt-0.5 font-mono">
                    {lineNumber}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0 select-none pt-0.5 font-mono">
                    {timeStr}
                  </span>
                  <span
                    className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.2 rounded shrink-0 select-none ${
                      log.stream === 'system'
                        ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20'
                        : log.stream === 'stderr'
                          ? 'bg-destructive/10 text-destructive border border-destructive/20'
                          : 'bg-secondary text-muted-foreground border border-border'
                    }`}
                  >
                    {log.stream}
                  </span>
                  <span className={`flex-1 break-all ${levelColor}`}>{log.message}</span>
                </div>
              );
            })
          )}
          <div ref={terminalEndRef} />
        </div>

        {/* Terminal Pagination Bar */}
        {filteredLogs.length > 0 && (
          <div className="border-t border-border bg-card/60 px-4 py-1.5">
            <Pagination
              currentPage={currentPage}
              totalItems={filteredLogs.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[25, 50, 100, 200]}
              itemLabel="log lines"
              className="py-1"
            />
          </div>
        )}

        {/* Terminal Status Footer */}
        <div className="p-3 px-5 border-t border-border bg-card flex items-center justify-between text-xs text-muted-foreground shrink-0 font-mono">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              Stream Buffer: <strong className="text-foreground">{filteredLogs.length}</strong> /{' '}
              {logs.length} entries
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2
              className={`h-3.5 w-3.5 ${tailStatus === 'Unavailable' ? 'text-destructive' : 'text-emerald-500'}`}
            />
            <span>Worker Agent Tail: {tailStatus}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
