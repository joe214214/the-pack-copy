/**
 * Read-only consistency check of money and order state. Exit code 1 if
 * anything is off, so it can run in CI or a cron.
 *
 *   npx tsx --env-file=.env scripts/reconcile-ledger.ts
 *
 * Checks:
 *   1. every ledger group sums to 0
 *   2. each user's cached balance / frozenBalance == their AVAILABLE / ESCROW sums
 *   3. each user's frozenBalance == escrow of their orders still holding money
 *      (a difference means frozen money with no order behind it, or vice versa)
 *   4. Task status agrees with its order (SETTLED -> COMPLETED, CANCELLED -> CANCELLED, active -> IN_PROGRESS)
 */
import { prisma } from "../src/lib/prisma";
import { ESCROW_HOLDING } from "../src/lib/orders/lifecycle";

const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const $ = (c: number) => (c / 100).toFixed(2);

async function main() {
  let problems = 0;

  // 1. balanced groups
  const groups = await prisma.ledgerEntry.groupBy({ by: ["groupId"], _sum: { amount: true } });
  const unbalanced = groups.filter((g) => cents(g._sum.amount) !== 0);
  for (const g of unbalanced) console.log(`UNBALANCED group ${g.groupId}: ${$(cents(g._sum.amount))}`);
  problems += unbalanced.length;

  // 2 + 3. per-user caches
  const [users, sums, held] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true, balance: true, frozenBalance: true } }),
    prisma.ledgerEntry.groupBy({ by: ["userId", "account"], where: { userId: { not: null } }, _sum: { amount: true } }),
    prisma.order.groupBy({ by: ["publisherId"], where: { status: { in: ESCROW_HOLDING } }, _sum: { escrowAmount: true } }),
  ]);
  const ledgerOf = (id: string, acct: "AVAILABLE" | "ESCROW") =>
    cents(sums.find((s) => s.userId === id && s.account === acct)?._sum.amount);
  const heldOf = (id: string) => cents(held.find((h) => h.publisherId === id)?._sum.escrowAmount);

  for (const u of users) {
    const bal = cents(u.balance), frozen = cents(u.frozenBalance);
    const lBal = ledgerOf(u.id, "AVAILABLE"), lEsc = ledgerOf(u.id, "ESCROW"), h = heldOf(u.id);
    if (bal !== lBal) { problems++; console.log(`CACHE   ${u.email}: balance ${$(bal)} but ledger AVAILABLE ${$(lBal)}`); }
    if (frozen !== lEsc) { problems++; console.log(`CACHE   ${u.email}: frozen ${$(frozen)} but ledger ESCROW ${$(lEsc)}`); }
    if (frozen !== h) { problems++; console.log(`ESCROW  ${u.email}: frozen ${$(frozen)} but active orders hold ${$(h)} (difference ${$(frozen - h)})`); }
  }

  // 4. task vs order
  const orders = await prisma.order.findMany({ select: { id: true, status: true, task: { select: { id: true, title: true, status: true } } } });
  const expected = (s: string) =>
    s === "SETTLED" ? "COMPLETED" : s === "CANCELLED" || s === "REFUNDED" ? "CANCELLED" : "IN_PROGRESS";
  for (const o of orders) {
    const want = expected(o.status);
    if (o.task.status !== want) {
      problems++;
      console.log(`TASK    "${o.task.title}" is ${o.task.status}, but its order is ${o.status} (expected ${want})`);
    }
  }

  const platform = await prisma.ledgerEntry.aggregate({ where: { account: "PLATFORM" }, _sum: { amount: true } });
  console.log(`\nPlatform fee revenue recorded in the ledger: $${$(cents(platform._sum.amount))}`);
  console.log(problems ? `${problems} problem(s) found.` : "All consistent.");
  process.exit(problems ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
}).finally(() => prisma.$disconnect());
