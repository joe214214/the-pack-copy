/**
 * Ledger — the ONLY code allowed to move money.
 *
 * Every movement is posted as a group of legs whose amounts sum to exactly 0
 * (see the LedgerEntry model). The User.balance / User.frozenBalance columns
 * are caches of the AVAILABLE / ESCROW sums and are updated here, in the same
 * transaction, never anywhere else. `scripts/reconcile-ledger.ts` verifies them.
 *
 * Guarded writes: a leg that takes money out of a user's AVAILABLE or ESCROW
 * is applied with a conditional `updateMany(... gte amount)`, so concurrent
 * requests cannot overdraw — the loser gets InsufficientFundsError and its
 * whole transaction rolls back.
 *
 * All amounts are handled in integer cents internally to avoid float drift.
 */
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { LedgerAccount, LedgerKind } from "@/generated/prisma/enums";
import { PLATFORM_FEE_RATE } from "@/lib/fees";

export type Tx = Prisma.TransactionClient;

export class InsufficientFundsError extends Error {
  constructor(public account: "AVAILABLE" | "ESCROW", public needed: number) {
    super(
      account === "AVAILABLE"
        ? `Insufficient balance: $${needed.toFixed(2)} needed`
        : `Escrow does not hold $${needed.toFixed(2)} for this order`
    );
    this.name = "InsufficientFundsError";
  }
}

export interface Leg {
  account: LedgerAccount;
  /** Required for AVAILABLE / ESCROW legs, must be absent for PLATFORM / EXTERNAL. */
  userId?: string | null;
  /** Dollars. Positive adds to the account, negative takes from it. */
  amount: number;
}

export interface Posting {
  kind: LedgerKind;
  legs: Leg[];
  orderId?: string | null;
  actorId?: string | null;
  memo?: string | null;
}

export const toCents = (dollars: number | string | { toString(): string }) =>
  Math.round(Number(dollars.toString()) * 100);
const fromCents = (cents: number) => cents / 100;

/** Splits a settled amount into the platform's fee and the agent owner's payout. */
export function splitFee(totalDollars: number) {
  const total = toCents(totalDollars);
  const fee = Math.round(total * PLATFORM_FEE_RATE);
  return { total: fromCents(total), fee: fromCents(fee), payout: fromCents(total - fee) };
}

/** Posts one balanced money movement. Returns its groupId. */
export async function post(tx: Tx, p: Posting): Promise<string> {
  const legs = p.legs
    .map((l) => ({ ...l, cents: toCents(l.amount) }))
    .filter((l) => l.cents !== 0);
  if (legs.length < 2) throw new Error(`Ledger posting ${p.kind} needs at least two non-zero legs`);

  const sum = legs.reduce((s, l) => s + l.cents, 0);
  if (sum !== 0) throw new Error(`Ledger posting ${p.kind} is unbalanced by ${sum} cents`);

  for (const l of legs) {
    const userLeg = l.account === "AVAILABLE" || l.account === "ESCROW";
    if (userLeg && !l.userId) throw new Error(`${l.account} leg needs a userId`);
    if (!userLeg && l.userId) throw new Error(`${l.account} leg must not carry a userId`);
  }

  // Apply the cache updates first; a guarded debit that fails aborts the tx
  // before any entry is written.
  for (const l of legs) {
    if (l.account !== "AVAILABLE" && l.account !== "ESCROW") continue;
    const field = l.account === "AVAILABLE" ? "balance" : "frozenBalance";
    const dollars = fromCents(Math.abs(l.cents));
    if (l.cents > 0) {
      await tx.user.update({ where: { id: l.userId! }, data: { [field]: { increment: dollars } } });
    } else {
      const r = await tx.user.updateMany({
        where: { id: l.userId!, [field]: { gte: dollars } },
        data: { [field]: { decrement: dollars } },
      });
      if (r.count !== 1) throw new InsufficientFundsError(l.account, dollars);
    }
  }

  const groupId = randomUUID();
  await tx.ledgerEntry.createMany({
    data: legs.map((l) => ({
      groupId,
      kind: p.kind,
      account: l.account,
      userId: l.userId ?? null,
      orderId: p.orderId ?? null,
      amount: fromCents(l.cents),
      memo: p.memo ?? null,
      actorId: p.actorId ?? null,
    })),
  });
  return groupId;
}

// ─── Named movements ────────────────────────────────────────────────────────
// Thin wrappers so call sites read as business events, not as leg arithmetic.

/** Publisher's available -> escrow, for an order. */
export const holdEscrow = (tx: Tx, a: { publisherId: string; orderId: string; amount: number; actorId?: string | null; kind?: "ESCROW_HOLD" | "EXTRA_REVISION"; memo?: string }) =>
  post(tx, {
    kind: a.kind ?? "ESCROW_HOLD",
    orderId: a.orderId,
    actorId: a.actorId,
    memo: a.memo,
    legs: [
      { account: "AVAILABLE", userId: a.publisherId, amount: -a.amount },
      { account: "ESCROW", userId: a.publisherId, amount: a.amount },
    ],
  });

/** Publisher's escrow -> back to their available (cancel / refund). */
export const releaseEscrow = (tx: Tx, a: { publisherId: string; orderId: string; amount: number; actorId?: string | null; memo?: string }) =>
  post(tx, {
    kind: "ESCROW_RELEASE",
    orderId: a.orderId,
    actorId: a.actorId,
    memo: a.memo,
    legs: [
      { account: "ESCROW", userId: a.publisherId, amount: -a.amount },
      { account: "AVAILABLE", userId: a.publisherId, amount: a.amount },
    ],
  });

/**
 * Publisher's escrow -> agent owner (minus the platform fee) on settlement.
 * Two groups — PAYOUT and PLATFORM_FEE — so each shows as its own line.
 */
export async function payOut(tx: Tx, a: { publisherId: string; agentOwnerId: string; orderId: string; amount: number; actorId?: string | null; memo?: string }) {
  const { fee, payout } = splitFee(a.amount);
  await post(tx, {
    kind: "PAYOUT",
    orderId: a.orderId,
    actorId: a.actorId,
    memo: a.memo,
    legs: [
      { account: "ESCROW", userId: a.publisherId, amount: -payout },
      { account: "AVAILABLE", userId: a.agentOwnerId, amount: payout },
    ],
  });
  if (fee > 0) {
    await post(tx, {
      kind: "PLATFORM_FEE",
      orderId: a.orderId,
      actorId: a.actorId,
      legs: [
        { account: "ESCROW", userId: a.publisherId, amount: -fee },
        { account: "PLATFORM", amount: fee },
      ],
    });
  }
  return { fee, payout };
}

/** Money entering (positive) or leaving (negative) a user's available balance by admin action. */
export const adminAdjust = (tx: Tx, a: { userId: string; amount: number; adminId: string; reason: string }) =>
  post(tx, {
    kind: "ADMIN_ADJUSTMENT",
    actorId: a.adminId,
    memo: a.reason,
    legs: [
      { account: "AVAILABLE", userId: a.userId, amount: a.amount },
      { account: "EXTERNAL", amount: -a.amount },
    ],
  });
