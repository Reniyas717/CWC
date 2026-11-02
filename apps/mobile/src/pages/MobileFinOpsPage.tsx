import { Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/common/Card';
import { MobileFinOpsWidget } from '@/components/finops/MobileFinOpsWidget';
import { mobileApi } from '@/services/api';

export function MobileFinOpsPage() {
  const { data: finops } = useQuery({
    queryKey: ['finops-summary'],
    queryFn: () => mobileApi.getFinOpsSummary(),
    refetchInterval: 10000,
  });

  const computeCost = finops?.awsComputeCostMonthly || 319.0;
  const networkingCost = finops?.awsNetworkingCostMonthly || 39.6;
  const totalCost = finops?.awsTotalCostMonthly || 358.6;

  return (
    <div className="space-y-4 pb-20 px-3.5 pt-3 max-w-md mx-auto">
      {/* Page Header */}
      <div>
        <h2 className="font-heading font-bold text-base text-foreground">FinOps & Arbitrage</h2>
        <p className="text-xs text-muted-foreground">
          Zero-Hyperscaler Distributed Infrastructure ROI
        </p>
      </div>

      {/* Main Interactive Arbitrage Widget */}
      <MobileFinOpsWidget />

      {/* Cloud Cost Comparison Breakdown (Dynamically fetched from backend) */}
      <Card className="border-border/80 bg-card overflow-hidden">
        <div className="p-3 border-b border-border/50">
          <h3 className="font-heading font-bold text-xs text-foreground">
            Cost Benchmark vs Hyperscalers
          </h3>
        </div>
        <CardContent className="p-3 space-y-2 text-xs">
          <div className="flex justify-between items-center py-1.5 border-b border-border/40">
            <span className="text-muted-foreground">AWS EC2 Equivalent Compute</span>
            <span className="font-mono font-semibold text-destructive">${computeCost.toFixed(2)} / mo</span>
          </div>
          <div className="flex justify-between items-center py-1.5 border-b border-border/40">
            <span className="text-muted-foreground">AWS NAT Gateway & Edge Data Egress</span>
            <span className="font-mono font-semibold text-destructive">${networkingCost.toFixed(2)} / mo</span>
          </div>
          <div className="flex justify-between items-center py-1.5 border-b border-border/40">
            <span className="text-muted-foreground">Total Hyperscaler Monthly Fee</span>
            <span className="font-mono font-bold text-destructive">${totalCost.toFixed(2)} / mo</span>
          </div>
          <div className="flex justify-between items-center py-1.5 pt-2 text-emerald-500 font-bold">
            <span className="flex items-center space-x-1">
              <Check className="h-4 w-4" />
              <span>Cloud Without Clouds Total</span>
            </span>
            <span className="font-mono text-sm">$0.00 / mo</span>
          </div>
        </CardContent>
      </Card>

      {/* How It Works & Architecture */}
      <div className="p-4 rounded-xl bg-secondary/30 border border-border space-y-2 text-xs leading-relaxed">
        <span className="font-heading font-bold text-foreground block text-xs">
          Why is it 100% Free?
        </span>
        <p className="text-muted-foreground text-[11px]">
          By aggregating existing, already-purchased developer workstations and donor laptops across a private Tailscale WireGuard mesh, Cloud Without Clouds completely eliminates server rental fees, hypervisor surcharges, and costly managed NAT gateways.
        </p>
      </div>
    </div>
  );
}
