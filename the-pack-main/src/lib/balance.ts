/**
 * Balance reads. Money is MOVED only by src/lib/ledger.ts (through the order
 * lifecycle in src/lib/orders/lifecycle.ts). The old freeze / release / debit /
 * credit helpers that wrote the balance columns directly — outside any
 * transaction — are gone on purpose.
 */
import { prisma } from "@/lib/prisma";

export { calculateFees, PLATFORM_FEE_RATE } from "@/lib/fees";

const n = (v: unknown) => Number(v ?? 0);

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
