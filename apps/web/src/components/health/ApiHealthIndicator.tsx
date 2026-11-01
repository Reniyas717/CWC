import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle2, AlertCircle, RefreshCw, Server, Database } from 'lucide-react';
import { HealthCheckResponse } from '@cloud-without-clouds/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function fetchHealth(): Promise<HealthCheckResponse> {
  const res = await fetch(`${API_URL}/health`);
  if (!res.ok) {
    throw new Error(`API returned status ${res.status}`);
  }
  return res.json();
}

export function ApiHealthIndicator() {
  const { data, error, isLoading, isFetching, refetch } = useQuery<HealthCheckResponse>({
    queryKey: ['api-health'],
    queryFn: fetchHealth,
    refetchInterval: 10000,
    retry: 2,
  });

  return (
    <Card>
      <CardHeader className="p-5 pb-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Server className="h-4 w-4 text-muted-foreground" />
              Control Plane API Status
            </CardTitle>
            <CardDescription className="text-xs">
              Live health verification against{' '}
              <code className="text-foreground font-mono text-[11px] bg-secondary px-1.5 py-0.5 rounded">
                {API_URL}/health
              </code>
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isLoading ? (
              <Badge variant="secondary" className="flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Checking
              </Badge>
            ) : data?.status === 'ok' ? (
              <Badge variant="success" className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Online
              </Badge>
            ) : data?.status === 'degraded' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <Activity className="h-3.5 w-3.5 animate-pulse text-amber-500" />
                Degraded (Dev Fallback)
              </span>
            ) : (
              <Badge variant="destructive" className="flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                Unreachable
              </Badge>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh API Health"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-muted-foreground ${isFetching ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-5 space-y-4">
        {data ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 bg-secondary/30 p-4 rounded-lg border border-border">
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground block">
                  Service
                </span>
                <span className="text-xs font-medium text-foreground truncate block">
                  {data.service}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground block">
                  Version
                </span>
                <span className="text-xs font-mono text-foreground">v{data.version}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground block">
                  Uptime
                </span>
                <span className="text-xs font-mono text-foreground">{data.uptime}s</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground block">
                  Environment
                </span>
                <span className="text-xs capitalize text-foreground">{data.environment}</span>
              </div>
            </div>

            {data.status === 'degraded' && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-700 dark:text-amber-300 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 shrink-0 text-amber-500" />
                  <span>
                    API server is active and running in{' '}
                    <strong>local development fallback mode</strong>. Backing database/cache
                    services are simulated in-memory.
                  </span>
                </div>
                <span className="text-[10px] font-mono shrink-0 uppercase tracking-wider bg-amber-500/20 px-2 py-0.5 rounded">
                  Mock Fallback
                </span>
              </div>
            )}
          </div>
        ) : error ? (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive flex items-start gap-3">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-xs font-semibold">Unable to connect to Control Plane API</p>
              <p className="text-[11px] opacity-80">
                Ensure the backend API server is running on{' '}
                <code className="font-mono">{API_URL}</code>.
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border pt-3">
          <span className="flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            Heartbeat polling every 10s
          </span>
          <span className="font-mono">
            {data
              ? `Last checked ${new Date(data.timestamp).toLocaleTimeString()}`
              : 'Awaiting first heartbeat'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
