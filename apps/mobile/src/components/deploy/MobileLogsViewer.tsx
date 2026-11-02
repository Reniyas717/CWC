import * as React from 'react';
import { Copy, Check, ArrowDownCircle } from 'lucide-react';
import { DeploymentLogEntry } from '@cloud-without-clouds/shared';
import { BottomSheet } from '@/components/common/BottomSheet';
import { mobileApi } from '@/services/api';
import { haptics } from '@/lib/haptics';

export interface MobileLogsViewerProps {
  deploymentId: string | null;
  onClose: () => void;
}

export function MobileLogsViewer({ deploymentId, onClose }: MobileLogsViewerProps) {
  const [logs, setLogs] = React.useState<DeploymentLogEntry[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [copied, setCopied] = React.useState<boolean>(false);
  const [filterLevel, setFilterLevel] = React.useState<'all' | 'info' | 'warn' | 'error'>('all');
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const fetchLogs = React.useCallback(async () => {
    if (!deploymentId) return;
    try {
      setLoading(true);
      const data = await mobileApi.getDeploymentLogs(deploymentId);
      setLogs(data);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [deploymentId]);

  React.useEffect(() => {
    if (deploymentId) {
      fetchLogs();
      const interval = setInterval(fetchLogs, 4000);
      return () => clearInterval(interval);
    }
  }, [deploymentId, fetchLogs]);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCopy = async () => {
    haptics.medium();
    const text = logs.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLogs = logs.filter((l) => (filterLevel === 'all' ? true : l.level === filterLevel));

  return (
    <BottomSheet
      isOpen={!!deploymentId}
      onClose={onClose}
      title="Container Runtime Logs"
      description={`Streaming stdout/stderr for deployment ${deploymentId || ''}`}
    >
      <div className="space-y-3">
        {/* Top Controls: Filter Pills & Copy */}
        <div className="flex items-center justify-between">
          <div className="flex space-x-1">
            {(['all', 'info', 'warn', 'error'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => {
                  haptics.light();
                  setFilterLevel(lvl);
                }}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  filterLevel === lvl
                    ? 'bg-emerald-500 text-white'
                    : 'bg-secondary text-muted-foreground hover:bg-muted'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center space-x-1 text-[11px] text-muted-foreground hover:text-foreground bg-secondary px-2 py-1 rounded-lg border border-border"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        {/* Monospace Terminal Box */}
        <div
          ref={scrollRef}
          className="h-64 rounded-xl bg-black/90 border border-border p-3 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-1.5 shadow-inner"
        >
          {loading && logs.length === 0 ? (
            <div className="text-muted-foreground text-center py-8">Fetching runtime telemetry...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-muted-foreground text-center py-8">No log entries found.</div>
          ) : (
            filteredLogs.map((log) => {
              const isErr = log.level === 'error';
              const isWarn = log.level === 'warn';
              return (
                <div key={log.id} className="flex items-start space-x-1.5">
                  <span className="text-muted-foreground/60 shrink-0 text-[10px]">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={`shrink-0 font-bold text-[10px] uppercase px-1 rounded ${
                      isErr
                        ? 'bg-destructive/30 text-destructive'
                        : isWarn
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-emerald-500/20 text-emerald-400'
                    }`}
                  >
                    {log.source || log.level}
                  </span>
                  <span
                    className={`break-all ${
                      isErr
                        ? 'text-destructive font-semibold'
                        : isWarn
                          ? 'text-amber-300'
                          : 'text-slate-200'
                    }`}
                  >
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
          <span className="flex items-center space-x-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live polling every 4s</span>
          </span>
          <button
            onClick={() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }
            }}
            className="flex items-center space-x-1 hover:text-foreground"
          >
            <ArrowDownCircle className="h-3 w-3" />
            <span>Scroll Bottom</span>
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
