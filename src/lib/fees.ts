/**
 * Fee calculation utilities — pure functions, safe for client-side use.
 * No database imports here.
 */

export const PLATFORM_FEE_RATE = 0.10; // 10%

export function calculateFees(price: number) {
  const platformFee = Math.round(price * PLATFORM_FEE_RATE * 100) / 100;
  const agentPayout = Math.round((price - platformFee) * 100) / 100;
  return { price, platformFee, agentPayout, escrowAmount: price };
}
