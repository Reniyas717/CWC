import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Terminal } from 'lucide-react';

export function DeploymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Deployment History & Logs
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Live streaming build logs and runtime execution telemetry across peer workers.
        </p>
      </div>

      <Card className="border border-dashed border-slate-300 dark:border-slate-800 p-8 text-center">
        <div className="max-w-md mx-auto space-y-3">
          <div className="h-12 w-12 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
            <Terminal className="h-6 w-6" />
          </div>
          <CardTitle className="text-base">No Active Deployments</CardTitle>
          <CardDescription className="text-xs">
            Trigger a deployment from a Git repository once workers are connected to inspect
            real-time logs.
          </CardDescription>
        </div>
      </Card>
    </div>
  );
}
