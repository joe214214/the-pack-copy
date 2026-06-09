/**
 * Balance Service — Mock payment system (Stripe-ready architecture)
 *
 * Operations:
 *   - freeze(userId, amount)    — reserve funds in escrow
 *   - release(userId, amount)   — return funds from escrow
 *   - debit(userId, amount)     — permanently deduct from balance + frozen
 *   - credit(userId, amount)    — add to balance
 *   - getBalance(userId)        — fetch current balances
 */

import { prisma } from "@/lib/prisma";

export { calculateFees, PLATFORM_FEE_RATE } from "@/lib/fees";

const n = (v: unknown) => Number(v ?? 0);

export class InsufficientBalanceError extends Error {
  constructor(available: number, required: number) {
    super(`Insufficient balance: need $${required.toFixed(2)}, have $${available.toFixed(2)}`);
    this.name = "InsufficientBalanceError";
  }
}

export async function getBalance(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balance: true, frozenBalance: true },
  });
  if (!user) throw new Error("User not found");
  return {
    available: n(user.balance),
    frozen: n(user.frozenBalance),
    total: n(user.balance) + n(user.frozenBalance),
  };
}

/**
 * Freeze (escrow) an amount from available balance.
 * Used when an order is created — funds held until settlement or refund.
 */
export async function freezeBalance(userId: string, amount: number) {
  const { available } = await getBalance(userId);
  if (available < amount) {
    throw new InsufficientBalanceError(available, amount);
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      balance: { decrement: amount },
      frozenBalance: { increment: amount },
    },
  });
}

/**
 * Release frozen funds back to available balance (e.g., order cancelled).
 */
export async function releaseBalance(userId: string, amount: number) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      balance: { increment: amount },
      frozenBalance: { decrement: amount },
    },
  });
}

/**
 * Debit frozen funds permanently (order settled — funds transferred to agent owner).
 */
export async function debitFrozenBalance(userId: string, amount: number) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      frozenBalance: { decrement: amount },
    },
  });
}

/**
 * Credit funds to a user's available balance (agent owner receives payout).
 */
export async function creditBalance(userId: string, amount: number) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      balance: { increment: amount },
    },
  });
}


