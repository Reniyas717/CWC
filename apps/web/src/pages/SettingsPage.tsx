import * as React from 'react';
import {
  Settings,
  Server,
  Database,
  Globe,
  Shield,
  CheckCircle2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Activity,
  Terminal,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ConfigRow {
  label: string;
  value: string;
  description?: string;
  mono?: boolean;
  copyable?: boolean;
  isSecret?: boolean;
  tag?: 'active' | 'secure' | 'standard';
}

interface Section {
  id: string;
  title: string;
  badge: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  rows: ConfigRow[];
}

const SECTIONS: Section[] = [
  {
    id: 'api',
    title: 'Control Plane API',
    badge: 'Express 4 ESM',
    description: 'Active HTTP endpoint for the Express control plane orchestrating worker nodes and deployments.',
    icon: Server,
    rows: [
      {
        label: 'Base API Endpoint',
        value: typeof window !== 'undefined'
          ? (import.meta.env.VITE_API_URL || 'http://localhost:4000')
          : 'http://localhost:4000',
        description: 'Primary REST API control plane interface',
        mono: true,
        copyable: true,
        tag: 'active',
      },
      {
        label: 'Health Check Route',
        value: '/health',
        description: 'Unauthenticated JSON heartbeat monitoring endpoint',
        mono: true,
        copyable: true,
        tag: 'active',
      },
      {
        label: 'API Namespace',
        value: '/api/v1',
        description: 'Versioned mutating and query resource route prefix',
        mono: true,
        copyable: true,
      },
      {
        label: 'Node Environment',
        value: typeof window !== 'undefined' ? import.meta.env.MODE : 'development',
        description: 'Current runtime build environment mode',
        mono: true,
      },
    ],
  },
  {
    id: 'data',
    title: 'Data Infrastructure',
    badge: 'Docker Compose',
    description: 'Persistent relational storage via PostgreSQL 16 and asynchronous task queues via Redis 7.',
    icon: Database,
    rows: [
      {
        label: 'Primary Database',
        value: 'PostgreSQL 16 Alpine',
        description: 'Transactional state for apps, workers, and deployments',
        tag: 'active',
      },
      {
        label: 'Queue & Cache',
        value: 'Redis 7 Alpine',
        description: 'Task assignment queue and ephemeral worker leases',
        tag: 'active',
      },
      {
        label: 'ORM Framework',
        value: 'Drizzle ORM + drizzle-kit',
        description: 'Lightweight TypeScript-first database mapping layer',
        mono: true,
      },
      {
        label: 'Migration Script',
        value: 'pnpm --filter @cloud-without-clouds/api db:generate',
        description: 'CLI command to generate declarative schema migrations',
        mono: true,
        copyable: true,
      },
    ],
  },
  {
    id: 'network',
    title: 'Networking & Ingress',
    badge: 'Tailscale + Cloudflare',
    description: 'Zero-cost private WireGuard mesh connecting worker nodes with public HTTPS tunnel fallback.',
    icon: Globe,
    rows: [
      {
        label: 'Overlay Mesh',
        value: 'Tailscale (WireGuard)',
        description: 'Peer-to-peer encrypted network with zero open firewall ports',
        tag: 'active',
      },
      {
        label: 'Private IP Range',
        value: '100.64.0.0/10 (CGNAT MagicDNS)',
        description: 'Internal mesh worker address allocation',
        mono: true,
      },
      {
        label: 'Edge Ingress',
        value: 'Cloudflare Quick Tunnel (cloudflared)',
        description: 'Ephemeral public *.trycloudflare.com endpoint for container workloads',
        tag: 'active',
      },
      {
        label: 'Reverse Proxy',
        value: 'Caddy (Admin API :2019)',
        description: 'Automated reverse proxy dynamic upstream registration',
        mono: true,
      },
    ],
  },
  {
    id: 'security',
    title: 'Security & Auth Tokens',
    badge: 'Mandatory Sandbox',
    description: 'Bearer token verification policies and hard kernel-level container resource caps.',
    icon: Shield,
    rows: [
      {
        label: 'Admin Authorization',
        value: typeof window !== 'undefined'
          ? (import.meta.env.VITE_ADMIN_TOKEN || 'cwc-admin-token-super-secret-dev')
          : 'cwc-admin-token-super-secret-dev',
        description: 'Required Bearer token for mutating /api/v1/deployments calls',
        mono: true,
        copyable: true,
        isSecret: true,
        tag: 'secure',
      },
      {
        label: 'Worker Node Secret',
        value: 'cwc-worker-secret-token-dev-2026',
        description: 'Required Bearer token for /api/v1/workers registration and heartbeats',
        mono: true,
        copyable: true,
        isSecret: true,
        tag: 'secure',
      },
      {
        label: 'Process Safety Limit',
        value: '--pids-limit=256',
        description: 'Prevents fork-bomb vulnerabilities on host machines',
        mono: true,
      },
      {
        label: 'Crash Loop Policy',
        value: '--restart=on-failure:3',
        description: 'Prevents infinite CPU exhaustion loops on worker workstations',
        mono: true,
      },
    ],
  },
  {
    id: 'ports',
    title: 'Port Allocations',
    badge: 'Local Dev Spec',
    description: 'Deterministic local development port mappings across all workspace applications.',
    icon: Terminal,
    rows: [
      {
        label: 'Control Plane API',
        value: 'http://localhost:4000',
        mono: true,
        copyable: true,
      },
      {
        label: 'Frontend Dashboard',
        value: 'http://localhost:5173',
        mono: true,
        copyable: true,
      },
      {
        label: 'Worker Agent Service',
        value: 'http://localhost:5001',
        mono: true,
        copyable: true,
      },
      {
        label: 'Dynamic Container Ports',
        value: '20000 – 25000 (Ephemeral)',
        description: 'Assigned via Docker ephemeral binding (-p 0:<port>)',
        mono: true,
      },
    ],
  },
];

export function SettingsPage() {
  const [activeCategory, setActiveCategory] = React.useState<string>('all');
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = React.useState<Record<string, boolean>>({});
  const [pingStatus, setPingStatus] = React.useState<{ status: 'idle' | 'checking' | 'ok' | 'error'; ms?: number }>({
    status: 'idle',
  });

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const toggleReveal = (key: string) => {
    setRevealedSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const pingApi = async () => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    setPingStatus({ status: 'checking' });
    const start = performance.now();
    try {
      const res = await fetch(`${apiUrl}/health`, { cache: 'no-cache' });
      const duration = Math.round(performance.now() - start);
      if (res.ok) {
        setPingStatus({ status: 'ok', ms: duration });
      } else {
        setPingStatus({ status: 'error', ms: duration });
      }
    } catch {
      setPingStatus({ status: 'error' });
    }
  };

  const visibleSections =
    activeCategory === 'all'
      ? SECTIONS
      : SECTIONS.filter((s) => s.id === activeCategory);

  return (
    <div className="space-y-8">
      {/* Header with live Ping Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1
            className="text-2xl font-bold tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
          >
            Platform Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Environment configuration, network mesh topology, and security credentials for this cluster.
          </p>
        </div>

        {/* Live API Ping Box */}
        <div className="flex items-center gap-2.5 bg-card border border-border p-2 rounded-lg shrink-0">
          <div className="flex items-center gap-2 px-2 text-xs">
            {pingStatus.status === 'idle' && (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground font-mono">Control Plane :4000</span>
              </>
            )}
            {pingStatus.status === 'checking' && (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                <span className="text-muted-foreground font-mono">Pinging...</span>
              </>
            )}
            {pingStatus.status === 'ok' && (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400 font-mono font-medium">
                  200 OK ({pingStatus.ms}ms)
                </span>
              </>
            )}
            {pingStatus.status === 'error' && (
              <>
                <span className="h-2 w-2 rounded-full bg-destructive" />
                <span className="text-destructive font-mono font-medium">Unreachable</span>
              </>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={pingApi}
            disabled={pingStatus.status === 'checking'}
            className="h-7 text-xs flex items-center gap-1.5"
          >
            <Activity className="h-3 w-3" />
            Test Endpoint
          </Button>
        </div>
      </div>

      {/* Horizontal Category Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-border pb-3 overflow-x-auto text-xs">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer shrink-0 ${
            activeCategory === 'all'
              ? 'bg-primary text-primary-foreground shadow-2xs font-semibold'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
          }`}
        >
          All Parameters
        </button>
        {SECTIONS.map((sec) => {
          const Icon = sec.icon;
          const isActive = activeCategory === sec.id;
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => setActiveCategory(sec.id)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-2xs font-semibold'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Icon className="h-3 w-3" />
              <span>{sec.title}</span>
            </button>
          );
        })}
      </div>

      {/* Two-Column Master / Detail Grid for Settings */}
      <div className="space-y-6">
        {visibleSections.map((section) => {
          const Icon = section.icon;

          return (
            <Card key={section.id} className="overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-border">
                {/* Left Column: Section Title & Identity */}
                <div className="lg:col-span-4 p-6 bg-secondary/15 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-foreground" />
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                        {section.badge}
                      </span>
                    </div>

                    <div>
                      <h2
                        className="text-base font-bold text-foreground"
                        style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
                      >
                        {section.title}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {section.description}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 text-[11px] text-muted-foreground font-mono flex items-center gap-1.5 opacity-70">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                    <span>Configuration verified in .env</span>
                  </div>
                </div>

                {/* Right Column: Key-Value Rows */}
                <div className="lg:col-span-8 divide-y divide-border bg-card">
                  {section.rows.map((row) => {
                    const rowKey = `${section.id}-${row.label}`;
                    const isCopied = copiedKey === rowKey;
                    const isMasked = row.isSecret && !revealedSecrets[rowKey];
                    const displayValue = isMasked
                      ? `${row.value.slice(0, 10)}••••••••••••••••`
                      : row.value;

                    return (
                      <div
                        key={row.label}
                        className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        {/* Label & Description */}
                        <div className="space-y-0.5 min-w-0 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">{row.label}</span>
                            {row.tag === 'active' && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded font-medium">
                                Active
                              </span>
                            )}
                            {row.tag === 'secure' && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded font-medium">
                                Secured
                              </span>
                            )}
                          </div>
                          {row.description && (
                            <p className="text-[11px] text-muted-foreground truncate">
                              {row.description}
                            </p>
                          )}
                        </div>

                        {/* Value & Actions */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <span
                            className={`text-xs text-foreground px-2 py-1 rounded bg-secondary/60 border border-border select-all ${
                              row.mono ? 'font-mono' : ''
                            }`}
                          >
                            {displayValue}
                          </span>

                          {row.isSecret && (
                            <button
                              type="button"
                              onClick={() => toggleReveal(rowKey)}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                              title={isMasked ? 'Reveal token' : 'Hide token'}
                            >
                              {isMasked ? (
                                <Eye className="h-3.5 w-3.5" />
                              ) : (
                                <EyeOff className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}

                          {row.copyable && (
                            <button
                              type="button"
                              onClick={() => handleCopy(row.value, rowKey)}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                              title="Copy to clipboard"
                            >
                              {isCopied ? (
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Developer Reference Banner */}
      <Card className="bg-secondary/20 p-5">
        <CardContent className="p-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
          <div className="space-y-1">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
              Runtime Architecture & Team Guardrails
            </span>
            <p className="text-muted-foreground text-[11px]">
              Detailed domain models, scheduling score S(W), and lifecycle state diagrams are documented in ARCHITECTURE.md.
            </p>
          </div>
          <a
            href="https://github.com/BnB-26-Final-Round/Team-Pony_Final-Round"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-secondary text-foreground hover:bg-secondary/80 font-medium text-xs shrink-0 transition-colors"
          >
            <span>View Architecture Docs</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
