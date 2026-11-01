import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Coins,
  RefreshCw,
  Sparkles,
  Server,
  Workflow,
  TrendingDown,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Leaf,
  DollarSign,
  ArrowRight,
  Info,
} from 'lucide-react';
import { api, FinOpsSummary } from '@/services/api';
import { FinOpsArbitrageWidget } from '@/components/finops/FinOpsArbitrageWidget';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Deployment, WorkerNode } from '@cloud-without-clouds/shared';

export function FinOpsPage() {
  const { data: summary, refetch, isRefetching } = useQuery<FinOpsSummary>({
    queryKey: ['finops-summary'],
    queryFn: () => api.getFinOpsSummary(),
    refetchInterval: 5000,
  });

  const { data: deployments = [] } = useQuery<Deployment[]>({
    queryKey: ['deployments'],
    queryFn: () => api.getDeployments(),
    refetchInterval: 5000,
  });

  const { data: workers = [] } = useQuery<WorkerNode[]>({
    queryKey: ['workers'],
    queryFn: () => api.getWorkers(),
    refetchInterval: 5000,
  });

  const runningDeployments = deployments.filter((d) => d.state === 'running');
  const activeWorkers = workers.filter((w) => w.state !== 'offline');

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1
              className="text-2xl font-bold tracking-tight text-foreground"
              style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
            >
              Cloud Cost Arbitrage & FinOps
            </h1>
            <Badge variant="success" className="text-[10px] tracking-wide uppercase font-semibold">
              $0.00 Mesh Bill
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Financial analytics, real-time AWS hyperscaler cost comparison, and interactive team scale ROI modeling.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isRefetching}
            className="h-9 px-3 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            <span>Recalculate</span>
          </Button>
        </div>
      </div>

      {/* Main FinOps Arbitrage Engine Widget */}
      <FinOpsArbitrageWidget />

      {/* Deep-Dive Grid: Cost Breakdown per Workload & Financial Architecture */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Workload-level FinOps Breakdown (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="h-full flex flex-col justify-between">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Workflow className="h-4 w-4 text-foreground" />
                    <span>Microservice Resource Arbitrage</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Live containers running on your peer workstations benchmarked against commercial cloud retail rates.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {runningDeployments.length} Active App{runningDeployments.length === 1 ? '' : 's'}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-5 pt-0 flex-1">
              {runningDeployments.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  No running workloads scheduled. Deploy an application to see per-container cost savings.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {runningDeployments.map((dep) => {
                    const matchedWorker = activeWorkers.find((w) => w.id === dep.workerId);
                    // AWS ECS Fargate benchmark: ~$0.04048 per vCPU-hr + $0.004445 per GB-hr (~$29/mo for 0.5 vCPU + 512MB RAM)
                    const awsContainerMonthly = 29.5;
                    return (
                      <div
                        key={dep.id}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-foreground truncate">
                              {dep.applicationId}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-secondary text-muted-foreground">
                              {dep.gitBranch}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Running
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>Host: <strong className="text-foreground font-mono">{matchedWorker?.name || dep.workerId || 'Worker'}</strong></span>
                            {dep.assignedPort && <span>• Port :{dep.assignedPort}</span>}
                            {dep.publicUrl && (
                              <a
                                href={dep.publicUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline inline-flex items-center gap-1"
                              >
                                <ExternalLink className="h-2.5 w-2.5" />
                                Gateway
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-xs text-muted-foreground">
                            Hyperscaler Retail Benchmark:{' '}
                            <span className="line-through text-destructive font-mono font-medium">
                              ${awsContainerMonthly.toFixed(2)}/mo
                            </span>
                          </div>
                          <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                            Local Workstation: $0.00 (100% saved)
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Financial Architecture & Business Model (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="h-full flex flex-col justify-between">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span>Zero-Cost Economic Architecture</span>
              </CardTitle>
              <CardDescription className="text-xs">
                How Cloud Without Clouds operates without monthly infrastructure expenditure.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 pt-0 space-y-3.5 text-xs">
              <div className="p-3 rounded-lg bg-secondary/40 border border-border space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span>1. Idle Silicon Harvest</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Personal workstations and developer laptops sit 80% idle during working hours. We repurpose that wasted compute locally.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-secondary/40 border border-border space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span>2. Zero Egress Peer Transit</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Encrypted WireGuard / Tailscale overlay mesh streams peer-to-peer traffic without hyperscaler egress bandwidth fees.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-secondary/40 border border-border space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span>3. Reverse Proxy Edge Gateway</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Automated Caddy upstream loading and Cloudflare Quick Tunnels expose public HTTPS routes with zero subscription fees.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-xs">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Net Platform Margin: 100% Free</span>
                </div>
                <p className="text-[11px] opacity-90">
                  Every deployment scheduled on Cloud Without Clouds turns hyperscaler cloud waste into pure gross margin.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
