import * as React from 'react';
import {
  GitBranch,
  FileCode,
  ShieldAlert,
  Cpu,
  Network,
  Globe,
  Terminal,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export type PipelineStageKey = 'git' | 'buildpack' | 'sandbox' | 'scheduler' | 'mesh' | 'ingress';

export interface StageInfo {
  id: PipelineStageKey;
  label: string;
  shortDesc: string;
  icon: React.ComponentType<{ className?: string }>;
  backendExplanation: {
    what: string;
    how: string;
    problemSolved: string;
    security: string;
  };
}

export const PIPELINE_STAGES: StageInfo[] = [
  {
    id: 'git',
    label: 'Source Ingestion',
    shortDesc: 'Isolated clone & branch checkout',
    icon: GitBranch,
    backendExplanation: {
      what: 'Clones repository into isolated temporary workspaces (/tmp/cwc-builds/<depId>).',
      how: 'Executes git clone --depth 1 with strict sanitized URL verification against public Git hosts.',
      problemSolved: 'No reliance on cloud-hosted Git agents; peer worker clones directly.',
      security: 'Path traversal attacks & symlink exploits are isolated in ephemeral directories.',
    },
  },
  {
    id: 'buildpack',
    label: 'Container Synthesis',
    shortDesc: 'Automated Dockerfile detection',
    icon: FileCode,
    backendExplanation: {
      what: 'Detects Dockerfiles or auto-synthesizes optimized multi-stage build scripts.',
      how: 'Inspects directory for package.json (Node), requirements.txt (Python), go.mod (Go), or index.html (Static).',
      problemSolved:
        'Supports arbitrary developer repositories with zero manual Docker configuration.',
      security: 'Builds inside sandboxed build contexts with unprivileged image layers.',
    },
  },
  {
    id: 'sandbox',
    label: 'Kernel Isolation',
    shortDesc: 'cgroups v2 & namespace limits',
    icon: ShieldAlert,
    backendExplanation: {
      what: 'Enforces hard resource boundaries on the donor laptop.',
      how: 'Spawns container with --memory=512m, --cpus=1.0, and --pids-limit=256.',
      problemSolved:
        'Guarantees third-party code cannot exhaust the host computer RAM or freeze the host OS.',
      security: 'PID caps completely neutralize fork-bomb vulnerabilities.',
    },
  },
  {
    id: 'scheduler',
    label: 'Placement Auction S(W)',
    shortDesc: 'Least-loaded peer placement',
    icon: Cpu,
    backendExplanation: {
      what: 'Selects the healthiest available contributor workstation across the peer mesh.',
      how: 'Evaluates candidate workers using S(W) = 0.4(MemRatio) + 0.4(CpuRatio) + 0.2(ActiveWorkloads/Max).',
      problemSolved:
        'Optimal cluster utilization without centralized Kubernetes control-plane bloat.',
      security: 'Validates free memory thresholds before placement to prevent OOM evictions.',
    },
  },
  {
    id: 'mesh',
    label: 'Private Peer Mesh',
    shortDesc: 'Tailscale encrypted overlay',
    icon: Network,
    backendExplanation: {
      what: 'Direct encrypted WireGuard networking between control plane and distributed laptops.',
      how: 'Containers bind to ephemeral host ports on private 100.x.y.z interfaces without router port-forwarding.',
      problemSolved:
        'Enables laptops behind restrictive residential NATs and firewalls to serve traffic.',
      security:
        'Traffic is end-to-end encrypted; container ports are never exposed on public IPv4.',
    },
  },
  {
    id: 'ingress',
    label: 'Edge Ingress & Tunnel',
    shortDesc: 'Zero-cost Caddy & Cloudflare proxy',
    icon: Globe,
    backendExplanation: {
      what: 'Exposes private container workloads via worldwide public HTTPS endpoints.',
      how: 'Control plane dynamically loads reverse proxy routes into Caddy Admin API and establishes Cloudflare quick tunnels.',
      problemSolved:
        'Free public accessibility without requiring registered domains or hyperscaler static IPs.',
      security: 'Automatic TLS termination and SSL encryption at edge without hosting costs.',
    },
  },
];

interface AnimatedPipelineProps {
  currentStage?: PipelineStageKey;
  status?: 'idle' | 'building' | 'deploying' | 'running' | 'failed';
  className?: string;
}

export function AnimatedPipeline({
  currentStage = 'ingress',
  status = 'running',
  className = '',
}: AnimatedPipelineProps) {
  const getStageIndex = (key: PipelineStageKey) => PIPELINE_STAGES.findIndex((s) => s.id === key);

  const [selectedStage, setSelectedStage] = React.useState<StageInfo>(() => {
    const idx = getStageIndex(currentStage);
    return idx >= 0 ? PIPELINE_STAGES[idx] : PIPELINE_STAGES[2];
  });
  const [activeSimulation, setActiveSimulation] = React.useState<boolean>(false);
  const [simulatedStep, setSimulatedStep] = React.useState<number>(2);

  // Active step index controlled by user clicks or simulation
  const [userStep, setUserStep] = React.useState<number>(() => {
    const idx = getStageIndex(currentStage);
    return idx >= 0 ? idx : 2;
  });

  const activeIndex = activeSimulation ? simulatedStep : userStep;

  const handleStageClick = (stage: StageInfo, idx: number) => {
    setActiveSimulation(false);
    setSelectedStage(stage);
    setUserStep(idx);
  };

  const triggerLiveTour = () => {
    setActiveSimulation(true);
    setSimulatedStep(0);
    setSelectedStage(PIPELINE_STAGES[0]);

    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step < PIPELINE_STAGES.length) {
        setSimulatedStep(step);
        setSelectedStage(PIPELINE_STAGES[step]);
      } else {
        clearInterval(interval);
        setTimeout(() => setActiveSimulation(false), 2000);
      }
    }, 1800);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Top Header & Tour Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h3
              className="text-sm font-bold text-foreground tracking-tight flex items-center gap-2"
              style={{ fontFamily: 'var(--font-heading, var(--font-sans))' }}
            >
              <Activity className="h-4 w-4 text-emerald-500" />
              <span>Distributed Deployment Execution Pipeline</span>
            </h3>
            <Badge variant="outline" className="text-[10px] font-mono py-0 h-5">
              Live Architecture
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time visualization of autonomous repository synthesis, kernel resource capping, and
            peer placement.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={triggerLiveTour}
          disabled={activeSimulation}
          className="h-8 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          <span>{activeSimulation ? 'Simulating Pipeline...' : 'Run Pipeline Tour'}</span>
        </Button>
      </div>

      {/* SVG Pipeline Canvas */}
      <div className="relative overflow-x-auto py-3 px-2">
        <div className="min-w-[720px] relative">
          {/* Animated Connecting Flow Line - cleanly positioned underneath the boxes */}
          <div className="absolute top-[52px] left-[8.333%] w-[83.333%] h-4 -translate-y-1/2 pointer-events-none z-0">
            {/* Background Track Line (Dashed) */}
            <div className="absolute top-1/2 left-0 w-full -translate-y-1/2 h-[2px] border-t-2 border-dashed border-border/80" />

            {/* Active Moving Green Line that slides smoothly to the clicked box */}
            <div
              className="absolute top-1/2 left-0 -translate-y-1/2 h-[3px] bg-emerald-500 rounded-full transition-all duration-500 ease-out shadow-[0_0_8px_rgba(16,185,129,0.5)]"
              style={{
                width: `${(activeIndex / (PIPELINE_STAGES.length - 1)) * 100}%`,
              }}
            />

            {/* Glowing active node cursor on the line */}
            <div
              className="absolute top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-emerald-400 border border-white dark:border-background shadow-[0_0_8px_rgba(52,211,153,0.9)] transition-all duration-500 ease-out -translate-x-1/2"
              style={{
                left: `${(activeIndex / (PIPELINE_STAGES.length - 1)) * 100}%`,
              }}
            />
          </div>

          {/* 6 Pipeline Nodes in equal 6-column grid */}
          <div className="grid grid-cols-6 relative z-10">
            {PIPELINE_STAGES.map((stage, idx) => {
              const Icon = stage.icon;
              const isCompleted = idx < activeIndex;
              const isCurrent = idx === activeIndex;
              const isSelected = selectedStage.id === stage.id;

              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => handleStageClick(stage, idx)}
                  className="flex flex-col items-center group cursor-pointer focus:outline-none w-full"
                >
                  {/* Node Box (cleanly sitting above the line) */}
                  <div
                    className={`h-11 w-11 rounded-md flex items-center justify-center transition-all duration-300 relative border ${
                      isSelected
                        ? 'border-emerald-500 bg-card text-foreground shadow-sm ring-2 ring-emerald-500/20 scale-105'
                        : isCurrent
                          ? 'border-emerald-500/80 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : isCompleted
                            ? 'border-emerald-500/50 bg-card text-emerald-600 dark:text-emerald-400'
                            : 'border-border/80 bg-card text-muted-foreground hover:border-foreground/40'
                    }`}
                  >
                    <Icon className="h-5 w-5" />

                    {/* Status Indicator Pip */}
                    {isCompleted && (
                      <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-[8px] text-white">
                        ✓
                      </span>
                    )}
                    {isCurrent && status === 'failed' && (
                      <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-destructive flex items-center justify-center text-[8px] text-white">
                        !
                      </span>
                    )}
                  </div>

                  {/* Spacer between the box and the label, through which the line passes cleanly underneath the box */}
                  <div className="h-4" />

                  {/* Node Label */}
                  <div className="text-center w-full px-1">
                    <p
                      className={`text-xs font-semibold tracking-tight transition-colors line-clamp-1 ${
                        isSelected
                          ? 'text-foreground underline underline-offset-4'
                          : isCurrent
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : isCompleted
                              ? 'text-foreground'
                              : 'text-muted-foreground'
                      }`}
                    >
                      {stage.label}
                    </p>
                    <span className="text-[10px] font-mono text-muted-foreground line-clamp-1 block mt-0.5">
                      Step 0${idx + 1}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Explanatory Deep-Dive Panel (No Box-inside-Box) */}
      <div className="rounded-md border border-border bg-card p-4 transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-border/80">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded bg-secondary flex items-center justify-center shrink-0">
              <selectedStage.icon className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">
                  Stage Deep-Dive
                </span>
                <span className="text-xs font-bold text-foreground">{selectedStage.label}</span>
              </div>
              <p className="text-[11px] text-muted-foreground font-mono">
                {selectedStage.shortDesc}
              </p>
            </div>
          </div>

          <Badge variant="secondary" className="text-[10px] font-mono h-5 self-start sm:self-auto">
            Zero-Hyperscaler Architecture
          </Badge>
        </div>

        {/* 4-Column Architectural Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
              <Terminal className="h-3 w-3" />
              1. What It Executes
            </span>
            <p className="text-foreground leading-relaxed">
              {selectedStage.backendExplanation.what}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
              <Cpu className="h-3 w-3" />
              2. Technical Method
            </span>
            <p className="text-muted-foreground leading-relaxed font-mono text-[11px]">
              {selectedStage.backendExplanation.how}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
              <Layers className="h-3 w-3" />
              3. Cloud Problem Solved
            </span>
            <p className="text-foreground leading-relaxed">
              {selectedStage.backendExplanation.problemSolved}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
              <ShieldAlert className="h-3 w-3 text-emerald-500" />
              4. Host Laptop Security
            </span>
            <p className="text-muted-foreground leading-relaxed text-[11px]">
              {selectedStage.backendExplanation.security}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
