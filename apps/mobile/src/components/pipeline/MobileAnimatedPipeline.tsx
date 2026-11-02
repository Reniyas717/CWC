import * as React from 'react';
import {
  GitBranch,
  Box,
  Shield,
  Cpu,
  Share2,
  Globe,
  Play,
  Activity,
} from 'lucide-react';
import { Card, CardContent } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { haptics } from '@/lib/haptics';

export interface MobileAnimatedPipelineProps {
  currentStage?: 'ingestion' | 'synthesis' | 'isolation' | 'auction' | 'mesh' | 'ingress';
}

const STAGES = [
  {
    id: 'ingestion',
    label: 'Source Ingestion',
    step: 'Step 01',
    icon: GitBranch,
    what: 'Clones repository into a temporary sandboxed build directory.',
    how: 'git clone --depth 1 into sandboxed tmp context.',
    problem: 'Removes dependency on hyperscaler container registry storage fees.',
    security: 'HTTPS endpoint validation; sandbox directory isolated.',
  },
  {
    id: 'synthesis',
    label: 'Container Synthesis',
    step: 'Step 02',
    icon: Box,
    what: 'Executes Docker build directly on worker laptop daemon.',
    how: 'Multi-stage Docker build utilizing BuildKit layer cache.',
    problem: 'Eliminates costly centralized CI/CD build runner queues.',
    security: 'Non-privileged build context; cannot alter host files.',
  },
  {
    id: 'isolation',
    label: 'Kernel Isolation',
    step: 'Step 03',
    icon: Shield,
    what: 'Enforces hard resource boundaries on the donor laptop.',
    how: 'Spawns container with --memory=512m, --cpus=1.0, --pids-limit=256.',
    problem: 'Third-party code cannot exhaust host RAM or freeze machine.',
    security: 'PID limits completely neutralize fork-bomb vulnerabilities.',
  },
  {
    id: 'auction',
    label: 'Placement Auction S(W)',
    step: 'Step 04',
    icon: Cpu,
    what: 'Evaluates least-loaded scoring S(W) to select optimal node.',
    how: 'S(W) = 0.4*Mem + 0.4*CPU + 0.2*Containers load balance algorithm.',
    problem: 'Prevents thermal hotspots and battery drain on any single laptop.',
    security: 'Rejects nodes below minimum RAM threshold.',
  },
  {
    id: 'mesh',
    label: 'Private Peer Mesh',
    step: 'Step 05',
    icon: Share2,
    what: 'Encrypted WireGuard overlay tunnel over Tailscale mesh.',
    how: 'Containers bind to ephemeral ports on private 100.x.y.z interfaces.',
    problem: 'Enables laptops behind home NATs and firewalls to serve traffic.',
    security: 'End-to-end encrypted; ports never exposed on public IPv4.',
  },
  {
    id: 'ingress',
    label: 'Edge Ingress & Tunnel',
    step: 'Step 06',
    icon: Globe,
    what: 'Exposes container via zero-cost Caddy and Cloudflare Quick Tunnel.',
    how: 'Reverse proxy routes dynamically published to edge.',
    problem: 'Free worldwide HTTPS without purchasing custom domains.',
    security: 'Automatic TLS termination and SSL encryption at edge.',
  },
];

export function MobileAnimatedPipeline({ currentStage = 'ingress' }: MobileAnimatedPipelineProps) {
  const [selectedIdx, setSelectedIdx] = React.useState<number>(() => {
    const idx = STAGES.findIndex((s) => s.id === currentStage);
    return idx >= 0 ? idx : 2;
  });
  const [isSimulating, setIsSimulating] = React.useState<boolean>(false);

  const activeIdx = selectedIdx;
  const currentStageInfo = STAGES[activeIdx];

  const handleStageClick = (idx: number) => {
    haptics.light();
    setIsSimulating(false);
    setSelectedIdx(idx);
  };

  const triggerTour = () => {
    haptics.medium();
    setIsSimulating(true);
    setSelectedIdx(0);
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step < STAGES.length) {
        setSelectedIdx(step);
      } else {
        clearInterval(interval);
        setTimeout(() => setIsSimulating(false), 1500);
      }
    }, 1400);
  };

  return (
    <Card className="border-border/80 bg-card overflow-hidden">
      {/* Header exactly like PC version */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Activity className="h-4 w-4 text-emerald-500" />
          <h3 className="text-xs font-bold font-heading text-foreground tracking-tight">
            Distributed Execution Pipeline
          </h3>
          <Badge variant="outline" className="text-[9px] font-mono py-0 h-4">
            Live
          </Badge>
        </div>
        <button
          onClick={triggerTour}
          disabled={isSimulating}
          className="text-[10px] font-medium text-emerald-500 hover:text-emerald-400 bg-secondary/80 border border-border px-2 py-1 rounded-md active:scale-95 transition-all flex items-center space-x-1"
        >
          <Play className={`h-2.5 w-2.5 ${isSimulating ? 'animate-spin' : ''}`} />
          <span>{isSimulating ? 'Touring...' : 'Run Tour'}</span>
        </button>
      </div>

      <CardContent className="p-3 space-y-3">
        {/* 6 Icons Grid with connecting line underneath */}
        <div className="relative pt-1 pb-1">
          {/* Connecting Track Line Underneath the Boxes */}
          <div className="absolute top-[28px] left-[8.333%] w-[83.333%] h-[2px] -translate-y-1/2 pointer-events-none z-0">
            <div className="absolute inset-0 border-t-2 border-dashed border-border" />
            <div
              className="absolute top-0 left-0 h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out shadow-[0_0_8px_rgba(16,185,129,0.5)]"
              style={{
                width: `${(activeIdx / (STAGES.length - 1)) * 100}%`,
              }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-emerald-400 border border-white dark:border-background shadow-[0_0_6px_rgba(52,211,153,0.9)] transition-all duration-500 ease-out -translate-x-1/2"
              style={{
                left: `${(activeIdx / (STAGES.length - 1)) * 100}%`,
              }}
            />
          </div>

          {/* 6 Icons Grid */}
          <div className="grid grid-cols-6 relative z-10 gap-1">
            {STAGES.map((stage, idx) => {
              const Icon = stage.icon;
              const isSelected = activeIdx === idx;
              const isCompleted = idx < activeIdx;

              return (
                <button
                  key={stage.id}
                  onClick={() => handleStageClick(idx)}
                  className="flex flex-col items-center focus:outline-none group cursor-pointer"
                >
                  {/* Icon Box cleanly above the line */}
                  <div
                    className={`h-9 w-9 rounded-md flex items-center justify-center transition-all duration-300 relative border ${
                      isSelected
                        ? 'border-emerald-500 bg-card text-foreground shadow-xs ring-2 ring-emerald-500/20 scale-105'
                        : isCompleted
                          ? 'border-emerald-500/60 bg-card text-emerald-500'
                          : 'border-border bg-card text-muted-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {isCompleted && (
                      <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-500 flex items-center justify-center text-[7px] text-white">
                        ✓
                      </span>
                    )}
                  </div>

                  <div className="h-2.5" />

                  <span
                    className={`text-[8px] font-mono line-clamp-1 block transition-colors ${
                      isSelected ? 'text-emerald-500 font-bold' : 'text-muted-foreground'
                    }`}
                  >
                    0{idx + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Stage Explanation Deep-Dive (Clean PC Style) */}
        <div className="p-3 rounded-xl bg-secondary/30 border border-border space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-foreground font-heading">
              {currentStageInfo.step}: {currentStageInfo.label}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              Zero-Hyperscaler
            </span>
          </div>

          <p className="text-[11px] text-foreground/90 leading-relaxed">
            {currentStageInfo.what}
          </p>

          <div className="pt-2 border-t border-border/50 grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <span className="text-muted-foreground block text-[9px] uppercase font-semibold">1. Execution</span>
              <span className="text-foreground/80 line-clamp-2">{currentStageInfo.how}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[9px] uppercase font-semibold">2. Laptop Security</span>
              <span className="text-foreground/80 line-clamp-2">{currentStageInfo.security}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
