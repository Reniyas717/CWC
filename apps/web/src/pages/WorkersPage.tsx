import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Cpu } from 'lucide-react';

export function WorkersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Distributed Worker Nodes
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Connected laptops and physical computers contributing computing resources.
        </p>
      </div>

      <Card className="border border-dashed border-slate-300 dark:border-slate-800 p-8 text-center">
        <div className="max-w-md mx-auto space-y-3">
          <div className="h-12 w-12 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            <Cpu className="h-6 w-6" />
          </div>
          <CardTitle className="text-base">No Workers Registered Yet</CardTitle>
          <CardDescription className="text-xs">
            Start the worker agent using{' '}
            <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
              pnpm dev:worker
            </code>{' '}
            to link your first computer.
          </CardDescription>
        </div>
      </Card>
    </div>
  );
}
