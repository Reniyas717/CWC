import * as React from 'react';
import { Copy, Check, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/common/Input';
import { mobileApi } from '@/services/api';
import { DeploymentLogEntry } from '@cloud-without-clouds/shared';
import { haptics } from '@/lib/haptics';

export function MobileLogsPage() {
  const [search, setSearch] = React.useState('');
  const [filterLevel, setFilterLevel] = React.useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [copied, setCopied] = React.useState(false);

  const { data: deployments = [] } = useQuery({
    queryKey: ['deployments'],
    queryFn: () => mobileApi.getDeployments(),
  });

  const [allLogs, setAllLogs] = React.useState<DeploymentLogEntry[]>([]);

  React.useEffect(() => {
    let mounted = true;
    async function loadLogs() {
      const logsAccumulator: DeploymentLogEntry[] = [];
      for (const dep of deployments.slice(0, 5)) {
        try {
          const l = await mobileApi.getDeploymentLogs(dep.id);
          logsAccumulator.push(...l);
        } catch {
          // Ignore
        }
      }
      if (mounted) {
        setAllLogs(logsAccumulator.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      }
    }
    if (deployments.length > 0) {
      loadLogs();
      const interval = setInterval(loadLogs, 6000);
      return () => {
        mounted = false;
        clearInterval(interval);
      };
    }
  }, [deployments]);

  const filtered = allLogs.filter((log) => {
    const matchSearch =
      log.message.toLowerCase().includes(search.toLowerCase()) ||
      log.deploymentId.toLowerCase().includes(search.toLowerCase());
    const matchLevel = filterLevel === 'all' ? true : log.level === filterLevel;
    return matchSearch && matchLevel;
  });

  const handleCopy = async () => {
    haptics.medium();
    const text = filtered.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4 pb-20 px-3.5 pt-3 max-w-md mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-bold text-base text-foreground">Cluster Telemetry Logs</h2>
          <p className="text-xs text-muted-foreground">Live stdout/stderr stream from donor laptops</p>
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 text-xs text-muted-foreground hover:text-foreground bg-secondary px-2.5 py-1 rounded-xl border border-border"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Filter logs by keyword or deployment ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 text-xs h-9"
        />
      </div>

      {/* Filter Chips */}
      <div className="flex space-x-1.5">
        {(['all', 'info', 'warn', 'error'] as const).map((lvl) => (
          <button
            key={lvl}
            onClick={() => {
              haptics.light();
              setFilterLevel(lvl);
            }}
            className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors ${
              filterLevel === lvl
                ? 'bg-emerald-500 text-white shadow-xs'
                : 'bg-secondary text-muted-foreground hover:bg-muted'
            }`}
          >
            {lvl}
          </button>
        ))}
      </div>

      {/* Monospace Terminal */}
      <div className="h-96 rounded-2xl bg-black/90 border border-border p-3 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-2 shadow-inner">
        {filtered.length === 0 ? (
          <div className="text-muted-foreground text-center py-12">No log events match criteria.</div>
        ) : (
          filtered.map((log, i) => {
            const isErr = log.level === 'error';
            const isWarn = log.level === 'warn';
            return (
              <div key={`${log.id}-${i}`} className="space-y-0.5 border-b border-white/5 pb-1">
                <div className="flex items-center space-x-1.5 text-[9px] text-muted-foreground/60">
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span>•</span>
                  <span className="text-foreground/70">{log.deploymentId}</span>
                  <span
                    className={`font-bold uppercase px-1 rounded text-[8px] ${
                      isErr
                        ? 'bg-destructive/30 text-destructive'
                        : isWarn
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-emerald-500/20 text-emerald-400'
                    }`}
                  >
                    {log.source || log.level}
                  </span>
                </div>
                <div
                  className={`break-all ${
                    isErr
                      ? 'text-destructive font-semibold'
                      : isWarn
                        ? 'text-amber-300'
                        : 'text-slate-200'
                  }`}
                >
                  {log.message}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
