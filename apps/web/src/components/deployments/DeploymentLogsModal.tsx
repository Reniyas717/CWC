import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  Terminal,
  Copy,
  Check,
  Search,
  RotateCw,
  AlertCircle,
  CheckCircle2,
  Download,
  Filter,
} from 'lucide-react';
import { Deployment, DeploymentLogEntry } from '@cloud-without-clouds/shared';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataError } from '@/components/ui/data-error';

interface DeploymentLogsModalProps {
  deployment: Deployment | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DeploymentLogsModal({
  deployment,
  isOpen,
  onClose,
}: DeploymentLogsModalProps) {
  const [streamFilter, setStreamFilter] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isCopied, setIsCopied] = React.useState(false);
  const [autoScroll, setAutoScroll] = React.useState(true);
  const terminalEndRef = React.useRef<HTMLDivElement>(null);

  const {
    data: logs = [],
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery<DeploymentLogEntry[]>({
    queryKey: ['deployment-logs', deployment?.id],
    queryFn: () => (deployment ? api.getDeploymentLogs(deployment.id) : Promise.resolve([])),
    enabled: isOpen && !!deployment,
    refetchInterval: deployment?.state === 'running' || deployment?.state === 'building' ? 3000 : false,
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

  // Auto-scroll to bottom
  React.useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs, autoScroll]);

  if (!isOpen || !deployment) return null;

  const handleCopyLogs = () => {
    const text = filteredLogs
      .map((l) => `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.stream.toUpperCase()}] [${l.level.toUpperCase()}] ${l.message}`)
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
    link.download = `${deployment.id}-logs.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = () => {
    switch (deployment.state) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Running
          </span>
        );
      case 'building':
      case 'deploying':
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-spin" />
            {deployment.state}
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
      case 'stopped':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium bg-secondary text-muted-foreground border border-border">
            <CheckCircle2 className="h-3 w-3" />
            {deployment.state}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-background/80 backdrop-blur-xs no-scrollbar overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-card border border-border rounded-xl shadow-2xl flex flex-col h-[85vh] overflow-hidden text-foreground">
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
              <Terminal className="h-4 w-4 text-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-foreground truncate">
                  {deployment.id}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-muted-foreground">
                  v{deployment.version}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-muted-foreground">
                  {deployment.gitBranch}
                </span>
                {getStatusBadge()}
              </div>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                Worker: <span className="font-mono text-foreground">{deployment.workerId || 'pending assignment'}</span>
                {deployment.assignedPort && ` • Port ${deployment.assignedPort}`}
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-7.5 px-2.5 text-xs flex items-center gap-1"
              title="Refresh logs"
            >
              <RotateCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLogs}
              className="h-7.5 px-2.5 text-xs flex items-center gap-1"
              title="Copy filtered logs"
            >
              {isCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              <span className="hidden sm:inline">{isCopied ? 'Copied' : 'Copy'}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadLogs}
              className="h-7.5 px-2.5 text-xs flex items-center gap-1"
              title="Download raw logs"
            >
              <Download className="h-3 w-3" />
              <span className="hidden sm:inline">Export</span>
            </Button>

            <button
              type="button"
              onClick={onClose}
              className="h-7.5 w-7.5 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer ml-1"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filter & Stream Tabs Bar */}
        <div className="px-5 py-2.5 bg-secondary/30 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0 text-xs">
          {/* Stream Selector */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <span className="text-muted-foreground font-mono text-[11px] flex items-center gap-1 mr-1">
              <Filter className="h-3 w-3" />
              Stream:
            </span>
            {['all', 'stdout', 'stderr', 'system'].map((stream) => (
              <button
                key={stream}
                type="button"
                onClick={() => setStreamFilter(stream)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono capitalize transition-colors cursor-pointer ${
                  streamFilter === stream
                    ? 'bg-foreground text-background font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                {stream}
              </button>
            ))}
          </div>

          {/* Search Input & Auto-Scroll Toggle */}
          <div className="flex items-center gap-2">
            <div className="relative w-44 sm:w-56">
              <Search className="h-3 w-3 absolute left-2.5 top-2 text-muted-foreground" />
              <Input
                placeholder="Filter output..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 text-[11px] pl-7 font-mono bg-background"
              />
            </div>
            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-colors cursor-pointer border ${
                autoScroll
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-secondary text-muted-foreground border-border'
              }`}
            >
              Auto-Scroll: {autoScroll ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        {/* Terminal Surface (Light & Dark theme optimized) */}
        <div className="flex-1 bg-secondary/15 dark:bg-black/60 p-4 font-mono text-xs overflow-y-auto no-scrollbar space-y-1 select-text">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
              <RotateCw className="h-4 w-4 animate-spin" />
              <span>Fetching container log stream...</span>
            </div>
          ) : isError ? (
            <DataError title="Unable to load deployment logs" error={error} onRetry={() => void refetch()} />
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground space-y-1">
              <p>No log entries found for this filter.</p>
              <p className="text-[11px] opacity-75">
                Output will appear once the worker node streams stdout/stderr.
              </p>
            </div>
          ) : (
            filteredLogs.map((log, idx) => {
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
                  className="flex items-start gap-3 hover:bg-secondary/40 py-0.5 px-1.5 rounded transition-colors group leading-relaxed"
                >
                  <span className="text-[10px] text-muted-foreground/60 w-6 text-right select-none shrink-0 pt-0.5">
                    {idx + 1}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0 select-none pt-0.5">
                    {timeStr}
                  </span>
                  <span
                    className={`text-[9px] uppercase tracking-wider font-semibold px-1 py-0.2 rounded shrink-0 select-none ${
                      log.stream === 'system'
                        ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                        : log.stream === 'stderr'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {log.stream}
                  </span>
                  <span className={`flex-1 break-all ${levelColor}`}>
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
          <div ref={terminalEndRef} />
        </div>

        {/* Terminal Status Footer */}
        <div className="px-5 py-2.5 border-t border-border bg-card flex items-center justify-between text-[11px] text-muted-foreground shrink-0 font-mono">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Buffer: {filteredLogs.length} / {logs.length} entries</span>
          </div>
          <div>
            <span>ESC to close • Press Export to save</span>
          </div>
        </div>
      </div>
    </div>
  );
}
