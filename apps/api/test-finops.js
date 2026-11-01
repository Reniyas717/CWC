/**
 * Automated Verification Suite for FinOps Arbitrage Endpoint
 * Tests GET /api/v1/finops/summary and validates live calculation fields.
 */

const base = process.env.API_BASE_URL || 'http://127.0.0.1:4000';
const adminToken = process.env.ADMIN_TOKEN || 'cwc-admin-token-super-secret-dev';

async function testFinops() {
  console.log('[FinOps Test] Testing GET /api/v1/finops/summary...');

  const res = await fetch(`${base}/api/v1/finops/summary`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`FinOps endpoint returned HTTP ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  console.log('[FinOps Test] Response source:', json.source);
  console.log('[FinOps Test] Data:', JSON.stringify(json.data, null, 2));

  const data = json.data;
  if (!data) throw new Error('Response missing data property');

  const requiredFields = [
    'nodeCount',
    'totalVcpus',
    'totalMemoryMb',
    'totalMemoryGb',
    'awsInstanceEquivalent',
    'awsComputeCostMonthly',
    'awsNetworkingCostMonthly',
    'awsTotalCostMonthly',
    'awsTotalCostAnnual',
    'cwcCostMonthly',
    'cwcCostAnnual',
    'monthlySavings',
    'annualSavings',
    'savingsRatePerMinute',
    'savingsRatePerSecond',
    'carbonOffsetKgMonthly',
    'treesEquivalentAnnual',
  ];

  for (const field of requiredFields) {
    if (data[field] === undefined) {
      throw new Error(`FinOps data missing required field: ${field}`);
    }
  }

  console.log('✅ ALL FINOPS ASSERTIONS PASSED!');
}

testFinops().catch((err) => {
  console.error('❌ FinOps test failed:', err);
  process.exit(1);
});
