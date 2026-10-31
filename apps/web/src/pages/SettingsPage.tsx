import * as React from 'react';
import { Settings, Server, Database, Globe, Shield, CheckCircle2 } from 'lucide-react';

interface ConfigRow {
  label: string;
  value: string;
  mono?: boolean;
  tag?: 'active' | 'secure' | 'info';
}

interface Section {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  rows: ConfigRow[];
}

const SECTIONS: Section[] = [
  {
    title: 'Control Plane API',
    description: 'Active HTTP endpoint for the Express control plane serving this session.',
    icon: Server,
    rows: [
      {
        label: 'Base URL',
        value: typeof window !== 'undefined'
          ? (import.meta.env.VITE_API_URL || 'http://localhost:4000')
          : 'http://localhost:4000',
        mono: true,
        tag: 'active',
      },
      { label: 'Health check', value: '/health', mono: true },
      { label: 'API namespace', value: '/api/v1', mono: true },
      {
        label: 'Environment',
        value: typeof window !== 'undefined' ? import.meta.env.MODE : 'development',
        mono: true,
      },
    ],
  },
  {
    title: 'Data Services',
    description: 'PostgreSQL for persistent state and Redis for task queuing — both via Docker Compose.',
    icon: Database,
    rows: [
      { label: 'Primary database', value: 'PostgreSQL 16 Alpine', tag: 'active' },
      { label: 'Cache & queue', value: 'Redis 7 Alpine', tag: 'active' },
      { label: 'ORM layer', value: 'Drizzle ORM + drizzle-kit', mono: true },
      { label: 'Migrations', value: 'drizzle-kit generate', mono: true },
    ],
  },
  {
    title: 'Network Mesh',
    description: 'Private overlay mesh connecting the control plane to worker nodes without exposing public IPs.',
    icon: Globe,
    rows: [
      { label: 'Mesh protocol', value: 'Tailscale (WireGuard)', tag: 'active' },
      { label: 'Worker address range', value: '100.x.y.z (MagicDNS)', mono: true },
      { label: 'Public ingress', value: 'Cloudflare Quick Tunnel (cloudflared)', tag: 'active' },
      { label: 'Reverse proxy', value: 'Caddy — Admin API :2019', mono: true },
    ],
  },
  {
    title: 'Security & Isolation',
    description: 'Authentication tokens and mandatory container sandbox policies enforced by every worker node.',
    icon: Shield,
    rows: [
      { label: 'Admin token header', value: 'Authorization: Bearer ADMIN_TOKEN', mono: true, tag: 'secure' },
      { label: 'Worker token header', value: 'Authorization: Bearer WORKER_SECRET_TOKEN', mono: true, tag: 'secure' },
      { label: 'Process limit', value: '--pids-limit=256', mono: true },
      { label: 'Restart policy', value: '--restart=on-failure:3', mono: true },
    ],
  },
  {
    title: 'Runtime Ports',
    description: 'Default port bindings used during local development across all workspace packages.',
    icon: Settings,
    rows: [
      { label: 'Control Plane API', value: ':4000', mono: true },
      { label: 'Frontend (Vite)', value: ':5173', mono: true },
      { label: 'Worker Agent', value: ':5001', mono: true },
      { label: 'Container range', value: ':20000 – :25000 (ephemeral)', mono: true },
    ],
  },
];

function TagPill({ tag }: { tag: ConfigRow['tag'] }) {
  if (!tag) return null;
  if (tag === 'active') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
        <CheckCircle2 className="h-2.5 w-2.5" />
        Active
      </span>
    );
  }
  if (tag === 'secure') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">
        <Shield className="h-2.5 w-2.5" />
        Secured
      </span>
    );
  }
  return null;
}

export function SettingsPage() {
  return (
    <div className="space-y-10">
      {/* Page header */}
      <div className="space-y-1">
        <h1
          className="text-2xl font-bold tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
        >
          Platform Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Environment configuration, network mesh topology, and security token reference for the local cluster.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-0 divide-y divide-border border border-border rounded-xl overflow-hidden">
        {SECTIONS.map((section, si) => {
          const Icon = section.icon;
          return (
            <div key={si} className="grid grid-cols-1 md:grid-cols-[260px_1fr] bg-card">
              {/* Left: section identity */}
              <div className="p-6 border-b md:border-b-0 md:border-r border-border bg-secondary/20 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-md bg-secondary flex items-center justify-center shrink-0">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">{section.title}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{section.description}</p>
              </div>

              {/* Right: config rows */}
              <div className="divide-y divide-border">
                {section.rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-6 px-6 py-3.5"
                  >
                    <span className="text-xs text-muted-foreground shrink-0 w-40">{row.label}</span>
                    <div className="flex items-center gap-2 justify-end flex-wrap">
                      {row.tag && <TagPill tag={row.tag} />}
                      <span
                        className={`text-xs text-foreground text-right leading-relaxed ${
                          row.mono ? 'font-mono bg-secondary px-2 py-0.5 rounded-md' : ''
                        }`}
                      >
                        {row.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
