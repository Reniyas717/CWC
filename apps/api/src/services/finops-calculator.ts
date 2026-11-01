import { WorkerNode, Deployment } from '@cloud-without-clouds/shared';

export interface FinOpsSummary {
  // Live cluster metrics
  nodeCount: number;
  totalVcpus: number;
  totalMemoryMb: number;
  totalMemoryGb: number;
  activeWorkloadsCount: number;
  readyRoutesCount: number;

  // AWS equivalent mapping
  awsInstanceEquivalent: string;
  awsComputeCostMonthly: number;
  awsNetworkingCostMonthly: number;
  awsTotalCostMonthly: number;
  awsTotalCostAnnual: number;

  // Cloud Without Clouds cost
  cwcCostMonthly: number;
  cwcCostAnnual: number;

  // Arbitrage / Net Savings
  monthlySavings: number;
  annualSavings: number;
  savingsRatePerMinute: number;
  savingsRatePerSecond: number;

  // ESG / Sustainability Metrics
  carbonOffsetKgMonthly: number;
  treesEquivalentAnnual: number;

  // Timestamp
  calculatedAt: string;
}

/**
 * Calculates real-time cloud cost arbitrage by comparing live cluster capacity
 * against standard AWS EC2 on-demand Linux rates and AWS ALB/egress pricing.
 */
export function calculateFinOpsSummary(
  workers: WorkerNode[],
  deployments: Deployment[]
): FinOpsSummary {
  const activeWorkers = workers.filter((w) => w.state !== 'offline');
  const runningDeployments = deployments.filter(
    (d) => d.state === 'running' || d.state === 'queued'
  );
  const readyRoutes = deployments.filter(
    (d) =>
      d.state === 'running' &&
      d.routingStatus === 'ready' &&
      typeof d.publicUrl === 'string' &&
      d.publicUrl.startsWith('https://')
  );

  const nodeCount = activeWorkers.length;
  const totalVcpus = activeWorkers.reduce(
    (acc, w) => acc + (w.resources?.cpuCount ?? 4),
    0
  );
  const totalMemoryMb = activeWorkers.reduce(
    (acc, w) => acc + (w.resources?.totalMemoryMb ?? 8192),
    0
  );
  const totalMemoryGb = Number((totalMemoryMb / 1024).toFixed(1));
  const activeWorkloadsCount = runningDeployments.length;
  const readyRoutesCount = readyRoutes.length;

  if (nodeCount === 0) {
    return {
      nodeCount: 0,
      totalVcpus: 0,
      totalMemoryMb: 0,
      totalMemoryGb: 0,
      activeWorkloadsCount: 0,
      readyRoutesCount: 0,
      awsInstanceEquivalent: 'No active nodes',
      awsComputeCostMonthly: 0,
      awsNetworkingCostMonthly: 0,
      awsTotalCostMonthly: 0,
      awsTotalCostAnnual: 0,
      cwcCostMonthly: 0,
      cwcCostAnnual: 0,
      monthlySavings: 0,
      annualSavings: 0,
      savingsRatePerMinute: 0,
      savingsRatePerSecond: 0,
      carbonOffsetKgMonthly: 0,
      treesEquivalentAnnual: 0,
      calculatedAt: new Date().toISOString(),
    };
  }

  // AWS Pricing Benchmarks (US-East Graviton / x86 On-Demand Standard)
  // vCPU: ~$12.50 per core/month
  // RAM: ~$4.25 per GB/month
  const computeCost = Number((totalVcpus * 12.5 + totalMemoryGb * 4.25).toFixed(2));

  // AWS Application Load Balancer ($16.20 base/mo + $7.20/LCU per active route)
  // Egress bandwidth: $0.09/GB (standard cloud data transfer fee)
  const networkingCost = Number(
    (16.2 + readyRoutesCount * 7.2 + Math.max(readyRoutesCount, 1) * 4.5).toFixed(2)
  );

  const awsTotalCostMonthly = Number((computeCost + networkingCost).toFixed(2));
  const awsTotalCostAnnual = Number((awsTotalCostMonthly * 12).toFixed(2));

  // Determine closest AWS instance equivalent description
  let awsInstanceEquivalent = '1x AWS t4g.medium (2 vCPU, 4 GB)';
  if (totalMemoryGb >= 32) {
    const xlargeCount = Math.floor(totalMemoryGb / 16);
    const rem = totalMemoryGb % 16;
    awsInstanceEquivalent =
      rem >= 6
        ? `${xlargeCount}x AWS t4g.xlarge + 1x t4g.large`
        : `${xlargeCount}x AWS t4g.xlarge (${totalVcpus} vCPU, ${totalMemoryGb} GB)`;
  } else if (totalMemoryGb >= 20) {
    awsInstanceEquivalent = `1x AWS t4g.2xlarge (8 vCPU, 32 GB)`;
  } else if (totalMemoryGb >= 14) {
    awsInstanceEquivalent = `1x AWS t4g.xlarge (4 vCPU, 16 GB)`;
  } else if (totalMemoryGb >= 6) {
    awsInstanceEquivalent = `1x AWS t4g.large (2 vCPU, 8 GB)`;
  }

  // Savings rates
  const monthlySavings = awsTotalCostMonthly;
  const annualSavings = awsTotalCostAnnual;
  const secondsInMonth = 30 * 24 * 3600;
  const savingsRatePerSecond = Number((monthlySavings / secondsInMonth).toFixed(6));
  const savingsRatePerMinute = Number((savingsRatePerSecond * 60).toFixed(4));

  // ESG / Sustainability: Data center PUE + embodied server manufacturing carbon
  // Standard metric: ~0.507 kg CO2 / GB RAM / month
  const carbonOffsetKgMonthly = Number((totalMemoryGb * 0.507).toFixed(1));
  const treesEquivalentAnnual = Math.max(1, Math.round((carbonOffsetKgMonthly * 12) / 21));

  return {
    nodeCount,
    totalVcpus,
    totalMemoryMb,
    totalMemoryGb,
    activeWorkloadsCount,
    readyRoutesCount,
    awsInstanceEquivalent,
    awsComputeCostMonthly: computeCost,
    awsNetworkingCostMonthly: networkingCost,
    awsTotalCostMonthly,
    awsTotalCostAnnual,
    cwcCostMonthly: 0,
    cwcCostAnnual: 0,
    monthlySavings,
    annualSavings,
    savingsRatePerMinute,
    savingsRatePerSecond,
    carbonOffsetKgMonthly,
    treesEquivalentAnnual,
    calculatedAt: new Date().toISOString(),
  };
}
