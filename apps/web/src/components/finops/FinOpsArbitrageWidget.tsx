import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DollarSign,
  Leaf,
  Cpu,
  Zap,
  Sparkles,
  SlidersHorizontal,
  Clock,
  Coins,
  ShieldCheck,
  Flame,
  Info,
} from 'lucide-react';
import { api, FinOpsSummary } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function FinOpsArbitrageWidget() {
  const { data: summary, isLoading } = useQuery<FinOpsSummary>({
    queryKey: ['finops-summary'],
    queryFn: () => api.getFinOpsSummary(),
    refetchInterval: 5000,
  });

  // Interactive Fleet Scaling Simulation State (1 to 50 nodes)
  const [simulatedNodes, setSimulatedNodes] = React.useState<number>(12);
  const [sessionStartTime] = React.useState<number>(() => Date.now());
  const [sessionSaved, setSessionSaved] = React.useState<number>(0);

  // Initialize simulatedNodes once summary loads
  React.useEffect(() => {
    if (summary && summary.nodeCount > 0) {
      setSimulatedNodes((prev) => (prev === 12 ? Math.max(summary.nodeCount, 12) : prev));
    }
  }, [summary?.nodeCount]);

  // Live High-Frequency Arbitrage Ticker
  React.useEffect(() => {
    if (!summary || summary.savingsRatePerSecond <= 0) return;

    const interval = setInterval(() => {
      const elapsedSeconds = (Date.now() - sessionStartTime) / 1000;
      setSessionSaved(elapsedSeconds * summary.savingsRatePerSecond);
    }, 100);

    return () => clearInterval(interval);
  }, [summary, sessionStartTime]);

  // Dynamic values
  const nodeCount = summary?.nodeCount ?? 0;
  const totalVcpus = summary?.totalVcpus ?? 0;
  const totalMemoryGb = summary?.totalMemoryGb ?? 0;
  const monthlySavings = summary?.monthlySavings ?? 0;
  const annualSavings = summary?.annualSavings ?? 0;
  const awsComputeCost = summary?.awsComputeCostMonthly ?? 0;
  const awsNetworkingCost = summary?.awsNetworkingCostMonthly ?? 0;
  const awsTotalMonthly = summary?.awsTotalCostMonthly ?? 0;
  const awsEquivalent = summary?.awsInstanceEquivalent ?? 'AWS Compute Instance';
  const carbonOffset = summary?.carbonOffsetKgMonthly ?? 0;
  const treesCount = summary?.treesEquivalentAnnual ?? 0;

  // Simulator dynamic calculations
  const simAvgVcpus = nodeCount > 0 ? totalVcpus / nodeCount : 4;
  const simAvgRamGb = nodeCount > 0 ? totalMemoryGb / nodeCount : 16;
  const simTotalVcpus = Math.round(simAvgVcpus * simulatedNodes);
  const simTotalRamGb = Math.round(simAvgRamGb * simulatedNodes);
  const simMonthlyCompute = Number((simTotalVcpus * 12.5 + simTotalRamGb * 4.25).toFixed(2));
  const simWorkloads = Math.max(1, Math.round(simulatedNodes * 0.75));
  const simMonthlyNetworking = Number((16.2 + simWorkloads * 7.2 + simWorkloads * 4.5).toFixed(2));
  const simMonthlyTotal = Number((simMonthlyCompute + simMonthlyNetworking).toFixed(2));
  const simAnnualTotal = Number((simMonthlyTotal * 12).toFixed(2));
  const simAnnualCarbon = Number((simTotalRamGb * 0.507 * 12).toFixed(1));
  const simAnnualTrees = Math.max(1, Math.round(simAnnualCarbon / 21));

  if (isLoading && !summary) {
    return (
      <Card className="animate-pulse border-border bg-card">
        <CardContent className="p-6">
          <div className="h-6 w-48 bg-muted rounded mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="h-20 bg-muted/50 rounded" />
            <div className="h-20 bg-muted/50 rounded" />
            <div className="h-20 bg-muted/50 rounded" />
            <div className="h-20 bg-muted/50 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-border/80 bg-gradient-to-b from-card via-card to-secondary/10 shadow-sm transition-all">
      {/* Widget Header & Live Arbitrage Ticker */}
      <CardHeader className="p-5 pb-4 border-b border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="h-6 w-6 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Coins className="h-3.5 w-3.5" />
              </div>
              <CardTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
                Cloud Cost Arbitrage & FinOps Engine
              </CardTitle>
              <Badge variant="success" className="text-[10px] tracking-wide uppercase font-semibold">
                100% Free Mesh
              </Badge>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Dynamic hyperscaler cost benchmarking based on live aggregated idle silicon across your distributed workstations.
            </CardDescription>
          </div>

          {/* High-Frequency Live Savings Ticker */}
          <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto bg-background/80 dark:bg-muted/40 border border-border/80 px-3 py-1.5 rounded-lg shadow-2xs">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Session Arbitrage:
              </span>
            </div>
            <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
              +${sessionSaved.toFixed(5)}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-6">
        {/* Transparency Banner */}
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-secondary/50 border border-border text-xs text-muted-foreground">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-foreground">
              Zero AWS/Cloud Accounts Needed • 100% Local Peer Workstations:
            </span>
            <p className="text-[11px] leading-relaxed">
              Your containers run purely on your own developer laptops and workstations with Docker. The figures below benchmark your idle hardware against public hyperscaler pricing cards (AWS EC2 at $12.50/vCPU and $4.25/GB RAM) to prove how much capital your team saves by not purchasing commercial cloud instances.
            </p>
          </div>
        </div>

        {/* Top 4 Real-time Metric Badges */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Monthly Run-rate Savings */}
          <div className="p-4 rounded-xl bg-card border border-border/80 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Monthly Arbitrage</span>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
              ${monthlySavings.toFixed(2)}
              <span className="text-xs font-normal text-muted-foreground font-sans">/mo</span>
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              Annual: <span className="font-semibold text-foreground">${annualSavings.toFixed(2)}/yr</span>
            </div>
          </div>

          {/* Aggregated Idle Mesh Compute */}
          <div className="p-4 rounded-xl bg-card border border-border/80 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Aggregated Compute</span>
              <Cpu className="h-4 w-4 text-primary" />
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-foreground">
              {totalMemoryGb} <span className="text-sm font-normal text-muted-foreground">GB</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground font-mono">{totalVcpus} vCPUs</span> active across {nodeCount} workstation{nodeCount === 1 ? '' : 's'}
            </div>
          </div>

          {/* Hyperscaler Benchmark Equivalent */}
          <div className="p-4 rounded-xl bg-card border border-border/80 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Commercial Value Tier</span>
              <Zap className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-sm font-bold text-foreground truncate" title={awsEquivalent}>
              {awsEquivalent}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Public AWS EC2 market equivalent
            </div>
          </div>

          {/* Green Compute (ESG Metric) */}
          <div className="p-4 rounded-xl bg-card border border-border/80 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Green ESG Offset</span>
              <Leaf className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
              {carbonOffset} <span className="text-sm font-normal text-muted-foreground font-sans">kg CO₂</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              ≈ <span className="font-semibold text-foreground font-mono">{treesCount}</span> mature trees/yr
            </div>
          </div>
        </div>

        {/* Side-by-side Comparative Invoice Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* AWS Invoice (Hyperscaler Cloud) */}
          <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-destructive/15">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-destructive" />
                <span className="text-xs font-bold uppercase tracking-wider text-destructive">
                  Commercial Cloud Benchmark (AWS)
                </span>
              </div>
              <Badge variant="destructive" className="text-[10px]">
                Theoretical Retail Cost
              </Badge>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">EC2 On-Demand Compute ({totalVcpus} vCPU, {totalMemoryGb}GB RAM)</span>
                <span className="font-mono font-medium text-foreground">${awsComputeCost.toFixed(2)}/mo</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">AWS Application Load Balancer + LCUs</span>
                <span className="font-mono font-medium text-foreground">${(awsNetworkingCost * 0.65).toFixed(2)}/mo</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cloud Egress & Data Transfer Fees</span>
                <span className="font-mono font-medium text-foreground">${(awsNetworkingCost * 0.35).toFixed(2)}/mo</span>
              </div>
              <div className="pt-2 border-t border-destructive/15 flex items-center justify-between font-semibold">
                <span className="text-foreground">Hypothetical AWS Monthly Invoice</span>
                <span className="font-mono text-sm text-destructive">${awsTotalMonthly.toFixed(2)}/mo</span>
              </div>
            </div>
          </div>

          {/* Cloud Without Clouds Mesh (Our Cost) */}
          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/25 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-500/15">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Cloud Without Clouds (Local Workstations)
                </span>
              </div>
              <Badge variant="success" className="text-[10px]">
                Actual Bill: $0.00
              </Badge>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Repurposed Workstation Silicon (Docker)</span>
                <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">$0.00</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Direct Peer-to-Peer Mesh (Tailscale WireGuard)</span>
                <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">$0.00</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Zero-Cost Edge Gateway & Tunnels (Caddy)</span>
                <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">$0.00</span>
              </div>
              <div className="pt-2 border-t border-emerald-500/15 flex items-center justify-between font-semibold">
                <span className="text-foreground">Your Actual Infrastructure Outlay</span>
                <span className="font-mono text-sm text-emerald-600 dark:text-emerald-400">$0.00 / mo</span>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Team Scaling ROI Simulator */}
        <div className="p-4 rounded-xl bg-secondary/30 border border-border space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-primary/10 text-primary flex items-center justify-center">
                <SlidersHorizontal className="h-3 w-3" />
              </div>
              <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                Engineering Team Scaling Simulation
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              What if your entire team joins the compute mesh?
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">
                Simulated Workstation Fleet Size:
              </span>
              <span className="font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                {simulatedNodes} laptops & desktops
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="50"
              value={simulatedNodes}
              onChange={(e) => setSimulatedNodes(Number(e.target.value))}
              className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>1 laptop</span>
              <span>10 nodes</span>
              <span>25 nodes (Mid-size Team)</span>
              <span>50 nodes (Enterprise Org)</span>
            </div>
          </div>

          {/* Simulator Dynamic Projection Output */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-border/60">
            <div className="p-2.5 rounded-lg bg-card/60 border border-border/60 text-center">
              <div className="text-[10px] text-muted-foreground">Simulated Compute</div>
              <div className="font-mono text-sm font-bold text-foreground">
                {simTotalRamGb} GB <span className="text-xs text-muted-foreground">• {simTotalVcpus} vCPUs</span>
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-card/60 border border-border/60 text-center">
              <div className="text-[10px] text-muted-foreground">Monthly Cloud Spend Avoided</div>
              <div className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                ${simMonthlyTotal.toFixed(2)}/mo
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-card/60 border border-border/60 text-center">
              <div className="text-[10px] text-muted-foreground">Annual Cloud Budget Saved</div>
              <div className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                ${simAnnualTotal.toFixed(2)}/yr
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-card/60 border border-border/60 text-center">
              <div className="text-[10px] text-muted-foreground">Annual CO₂ Offsetting</div>
              <div className="font-mono text-sm font-bold text-foreground">
                {simAnnualCarbon} kg <span className="text-[10px] text-muted-foreground">({simAnnualTrees} trees)</span>
              </div>
            </div>
          </div>

          {/* Pitch Note for Judges */}
          <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-primary/5 border border-primary/15 p-2.5 rounded-lg">
            <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p>
              <strong className="text-foreground">CTO & Pitch Takeaway:</strong> An engineering team of {simulatedNodes} developers running tests, microservices, and preview environments on their idle workstations prevents{' '}
              <strong className="text-foreground font-mono">${simAnnualTotal.toLocaleString()}</strong> in unnecessary AWS hyperscaler invoices every year while eliminating {simAnnualCarbon} kg of data center carbon emissions.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
