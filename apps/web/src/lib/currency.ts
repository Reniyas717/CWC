/** Approximate USD to INR reference rate used for the FinOps benchmark display. */
export const USD_TO_INR_RATE = 95.05;

export function formatUsdAsInr(usdAmount: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(usdAmount * USD_TO_INR_RATE);
}
