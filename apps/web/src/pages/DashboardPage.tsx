import { ApiHealthIndicator } from '@/components/health/ApiHealthIndicator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Cpu, Rocket, ShieldCheck, GitBranch, ArrowUpRight } from 'lucide-react';

export function DashboardPage() {
  const stats = [
    {
      title: 'Active Workers',
      value: 'Ready for Pairing',
      description: 'Distributed laptops & desktop nodes',
      icon: Cpu,
      color: 'text-indigo-500',
    },
    {
      title: 'Deployments',
      value: '0 active',
      description: 'Containerized workloads across nodes',
      icon: Rocket,
      color: 'text-blue-500',
    },
    {
      title: 'Git Integrations',
      value: 'Configured',
      description: 'Automated builds & pipeline triggers',
      icon: GitBranch,
      color: 'text-emerald-500',
    },
    {
      title: 'Scheduling Policy',
      value: 'Resource-Aware',
      description: 'Isolated sandbox & health failover',
      icon: ShieldCheck,
      color: 'text-amber-500',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Network Dashboard
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Control plane overview, distributed worker health, and deployment orchestration.
        </p>
      </div>

      {/* Backend API Health Indicator */}
      <ApiHealthIndicator />

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <Card key={idx} className="border border-slate-200 dark:border-slate-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-slate-500">{stat.title}</CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                  {stat.value}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Architecture & Initialization Status */}
      <Card className="border border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Platform Initialisation Status</span>
            <span className="text-xs font-normal text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
              Initialisation Phase Complete
            </span>
          </CardTitle>
          <CardDescription>
            The foundational monorepo structure, shared schemas, control plane API, distributed
            worker agent, and frontend shell have been verified.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-xs text-slate-600 dark:text-slate-300">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="font-semibold block text-slate-900 dark:text-white mb-1">
                1. Monorepo & Workspaces
              </span>
              <p className="text-slate-500">
                pnpm + Turborepo managing <code>apps/web</code>, <code>apps/api</code>,{' '}
                <code>apps/worker</code>, and <code>packages/shared</code>.
              </p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="font-semibold block text-slate-900 dark:text-white mb-1">
                2. Control Plane & Data Store
              </span>
              <p className="text-slate-500">
                Express API with strict Zod validation, request logging, CORS, PostgreSQL, and Redis
                infrastructure.
              </p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="font-semibold block text-slate-900 dark:text-white mb-1">
                3. Distributed Worker Agent
              </span>
              <p className="text-slate-500">
                Worker node agent configured for host resource metrics, prepared for Docker
                container isolation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
            <span>
              Next Phase: Worker registration handshakes, Git clone & build pipeline, and
              intelligent scheduling.
            </span>
            <ArrowUpRight className="h-3 w-3" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
