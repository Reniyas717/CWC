import { ApiHealthIndicator } from '@/components/health/ApiHealthIndicator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Cpu, Rocket, ShieldCheck, GitBranch, ArrowUpRight, Network, Package, Workflow } from 'lucide-react';

const stats = [
  {
    title: 'Active Workers',
    value: '2',
    unit: 'Connected',
    description: 'Distributed laptops & desktop nodes',
    icon: Cpu,
  },
  {
    title: 'Deployments',
    value: '2',
    unit: 'Running',
    description: 'Containerised workloads across nodes',
    icon: Rocket,
  },
  {
    title: 'Scheduling Policy',
    value: 'Least-Load',
    unit: 'Active',
    description: 'Resource-aware peer placement',
    icon: ShieldCheck,
  },
  {
    title: 'Git Integrations',
    value: 'Live',
    unit: 'Configured',
    description: 'Automated builds & pipeline triggers',
    icon: GitBranch,
  },
];

const topology = [
  {
    index: '01',
    title: 'Monorepo & Workspaces',
    body: 'pnpm + Turborepo managing apps/web, apps/api, apps/worker, and packages/shared across a single unified repository.',
    icon: Package,
  },
  {
    index: '02',
    title: 'Control Plane & Data Store',
    body: 'Express API with strict Zod validation, request logging, CORS middleware, PostgreSQL 16, and Redis 7 infrastructure.',
    icon: Workflow,
  },
  {
    index: '03',
    title: 'Distributed Worker Agent',
    body: 'Node.js worker configured for host resource telemetry, HTTP task polling, and isolated Docker container execution.',
    icon: Network,
  },
];

export function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground" style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}>
          Network Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Control plane overview, distributed worker telemetry, and workload orchestration.
        </p>
      </div>

      {/* Backend API Health Indicator */}
      <ApiHealthIndicator />

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <Card key={idx} className="group">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <p className="text-xs font-medium text-muted-foreground leading-none">{stat.title}</p>
                  <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center shrink-0">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</span>
                    <span className="text-xs text-muted-foreground font-medium">{stat.unit}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{stat.description}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Platform Topology */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="space-y-1">
              <CardTitle className="text-sm font-semibold">Platform Topology & Status</CardTitle>
              <CardDescription className="text-xs">
                The distributed monorepo control plane, shared types, worker telemetry agent, and edge ingress are active.
              </CardDescription>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Cluster Fabric Active
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {topology.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.index} className="p-4 bg-secondary/20 rounded-lg border border-border space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-md bg-secondary flex items-center justify-center shrink-0">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <span className="text-xs font-semibold text-foreground">{item.title}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{item.body}</p>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-3 border-t border-border">
            <ArrowUpRight className="h-3 w-3 shrink-0" />
            <span>Next phase: multi-worker least-loaded scheduling and automated node failover on missed heartbeats.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
