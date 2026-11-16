/**
 * One-off: records every user's existing balance / frozenBalance as an
 * OPENING_BALANCE ledger group, so the ledger and the cached columns agree from
 * the moment the ledger goes live. Does NOT change any balance.
 *
 *   npx tsx --env-file=.env scripts/ledger-opening-balances.ts          # dry run
 *   npx tsx --env-file=.env scripts/ledger-opening-balances.ts --apply
 *
 * Idempotent: users who already have an OPENING_BALANCE entry are skipped.
 * Must run before any money moves through src/lib/ledger.ts for a user whose
 * balance predates the ledger, or reconcile will report the difference.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";

async function main() {
  const apply = process.argv.includes("--apply");
  const users = await prisma.user.findMany({ select: { id: true, email: true, balance: true, frozenBalance: true } });
  const done = new Set(
    (await prisma.ledgerEntry.findMany({ where: { kind: "OPENING_BALANCE" }, select: { userId: true }, distinct: ["userId"] }))
      .map((e) => e.userId)
  );

  let count = 0;
  for (const u of users) {
    const bal = Number(u.balance);
    const frozen = Number(u.frozenBalance);
    if (!bal && !frozen) continue;
    if (done.has(u.id)) {
      console.log(`skip  ${u.email} (already has an opening balance)`);
      continue;
    }
    console.log(`${apply ? "write" : "would"} ${u.email.padEnd(32)} available ${bal.toFixed(2).padStart(12)}  escrow ${frozen.toFixed(2).padStart(9)}`);
    count++;
    if (!apply) continue;
    const groupId = randomUUID();
    const legs = [
      { account: "EXTERNAL" as const, userId: null, amount: -(bal + frozen) },
      ...(bal ? [{ account: "AVAILABLE" as const, userId: u.id, amount: bal }] : []),
      ...(frozen ? [{ account: "ESCROW" as const, userId: u.id, amount: frozen }] : []),
    ];
    await prisma.ledgerEntry.createMany({
      data: legs.map((l) => ({ groupId, kind: "OPENING_BALANCE" as const, account: l.account, userId: l.userId, amount: l.amount, memo: "Balance carried over when the ledger was introduced (2026-11-16)" })),
    });
  }
  console.log(`\n${apply ? "Wrote" : "Dry run:"} ${count} opening balance group(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
