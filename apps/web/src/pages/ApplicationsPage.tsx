import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Layers, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ApplicationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Applications
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Deploy and manage web applications and services from Git repositories.
          </p>
        </div>
        <Button disabled className="opacity-60 cursor-not-allowed">
          <Plus className="h-4 w-4 mr-2" />
          New Application
        </Button>
      </div>

      <Card className="border border-dashed border-slate-300 dark:border-slate-800 p-8 text-center">
        <div className="max-w-md mx-auto space-y-3">
          <div className="h-12 w-12 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
            <Layers className="h-6 w-6" />
          </div>
          <CardTitle className="text-base">No Applications Configured</CardTitle>
          <CardDescription className="text-xs">
            Application deployment workflows will be enabled following worker node connection and
            build pipeline setup.
          </CardDescription>
        </div>
      </Card>
    </div>
  );
}
