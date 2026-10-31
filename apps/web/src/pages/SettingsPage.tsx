import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Settings, Server, Database, Globe, Shield } from 'lucide-react';

interface ConfigRow {
  label: string;
  value: string;
  mono?: boolean;
}

function ConfigSection({
  title,
  description,
  icon: Icon,
  rows,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  rows: ConfigRow[];
}) {
  return (
    <Card>
      <CardHeader className="p-5 pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="divide-y divide-border">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between py-3 gap-4">
              <span className="text-xs text-muted-foreground shrink-0">{row.label}</span>
              <span className={`text-xs text-foreground text-right ${row.mono ? 'font-mono' : ''}`}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1
          className="text-2xl font-bold tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
        >
          Platform Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Environment configuration, network endpoints, and security token reference.
        </p>
      </div>

      <div className="space-y-4 max-w-2xl">
        <ConfigSection
          title="API Endpoint"
          description="Active control plane API for this session."
          icon={Server}
          rows={[
            {
              label: 'Base URL',
              value: import.meta.env.VITE_API_URL || 'http://localhost:4000',
              mono: true,
            },
            { label: 'Health check', value: '/health', mono: true },
            { label: 'API namespace', value: '/api/v1', mono: true },
          ]}
        />

        <ConfigSection
          title="Runtime Environment"
          description="Node environment and build mode."
          icon={Settings}
          rows={[
            { label: 'Vite mode', value: import.meta.env.MODE, mono: true },
            { label: 'Worker agent port', value: '5001', mono: true },
            { label: 'Frontend dev port', value: '5173', mono: true },
          ]}
        />

        <ConfigSection
          title="Data Services"
          description="Backing data store and task queue infrastructure."
          icon={Database}
          rows={[
            { label: 'Database', value: 'PostgreSQL 16 (Docker Compose)' },
            { label: 'Cache / Queue', value: 'Redis 7 (Docker Compose)' },
            { label: 'ORM', value: 'Drizzle ORM (drizzle-kit)' },
          ]}
        />

        <ConfigSection
          title="Networking"
          description="Overlay mesh and public ingress configuration."
          icon={Globe}
          rows={[
            { label: 'Mesh network', value: 'Tailscale (WireGuard)' },
            { label: 'Public ingress', value: 'Cloudflare Quick Tunnel (cloudflared)' },
            { label: 'Reverse proxy', value: 'Caddy (Admin API :2019)' },
          ]}
        />

        <ConfigSection
          title="Security"
          description="Authentication tokens and sandbox policies."
          icon={Shield}
          rows={[
            { label: 'Admin auth', value: 'Bearer ADMIN_TOKEN', mono: true },
            { label: 'Worker auth', value: 'Bearer WORKER_SECRET_TOKEN', mono: true },
            { label: 'Container isolation', value: '--pids-limit=256, --restart=on-failure:3' },
          ]}
        />
      </div>
    </div>
  );
}
