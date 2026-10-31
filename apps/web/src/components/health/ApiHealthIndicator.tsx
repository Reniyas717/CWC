import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle2, AlertCircle, RefreshCw, Server } from 'lucide-react';
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
    <Card className="border border-gray-200 dark:border-gray-800 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4 text-blue-500" />
            Control Plane API Status
          </CardTitle>
          <CardDescription className="text-xs">
            Live health verification against{' '}
            <code className="text-blue-600 dark:text-blue-400 font-mono">{API_URL}/health</code>
          </CardDescription>
        </div>

        <div className="flex items-center gap-2">
          {isLoading ? (
            <Badge variant="secondary" className="flex items-center gap-1">
              <RefreshCw className="h-3 w-3 animate-spin text-gray-500" />
              Checking...
            </Badge>
          ) : data?.status === 'ok' ? (
            <Badge
              variant="success"
              className="flex items-center gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Online
            </Badge>
          ) : (
            <Badge variant="destructive" className="flex items-center gap-1">
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
            <RefreshCw className={`h-4 w-4 text-gray-500 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="text-xs space-y-3">
        {data ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
            <div>
              <span className="text-gray-500 block">Service</span>
              <span className="font-medium text-gray-900 dark:text-gray-100 truncate block">
                {data.service}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">Version</span>
              <span className="font-mono text-gray-900 dark:text-gray-100">v{data.version}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Uptime</span>
              <span className="font-mono text-gray-900 dark:text-gray-100">{data.uptime}s</span>
            </div>
            <div>
              <span className="text-gray-500 block">Environment</span>
              <span className="capitalize text-gray-900 dark:text-gray-100">
                {data.environment}
              </span>
            </div>
          </div>
        ) : error ? (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-400 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Unable to connect to Control Plane API</p>
              <p className="text-[11px] mt-0.5">
                Make sure the API server is running on <code className="font-mono">{API_URL}</code>.
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1 border-t border-gray-100 dark:border-gray-800">
          <span className="flex items-center gap-1">
            <Activity className="h-3 w-3 text-blue-500" />
            Automatic heartbeat sync every 10s
          </span>
          <span>
            {data
              ? `Checked: ${new Date(data.timestamp).toLocaleTimeString()}`
              : 'Awaiting heartbeat...'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
