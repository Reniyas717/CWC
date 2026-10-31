import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Settings } from 'lucide-react';

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Platform Settings
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Environment configuration, network domains, and security credentials.
        </p>
      </div>

      <Card className="border border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4 text-blue-500" />
            Environment Configuration
          </CardTitle>
          <CardDescription className="text-xs">
            Review the active endpoints for the local development cluster.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500">API Endpoint</span>
            <span className="font-mono">
              {import.meta.env.VITE_API_URL || 'http://localhost:4000'}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500">Node Environment</span>
            <span className="font-mono">{import.meta.env.MODE}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-slate-500">Storage & Queue</span>
            <span className="font-mono">PostgreSQL 16 & Redis 7</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
