/**
 * Read-only snapshot of order / task / balance state. Writes nothing.
 *
 *   npx tsx --env-file=.env scripts/db-snapshot.ts
 */
import { prisma } from "../src/lib/prisma";

const HOLDING = ["CREATED", "FUNDED", "EXECUTING", "REVIEW", "REVISION_REQUESTED", "DISPUTED", "ACCEPTED"] as const;

async function main() {
  const orders = await prisma.order.groupBy({
    by: ["status"],
    _count: { _all: true },
    _sum: { escrowAmount: true },
  });
  console.log("orders:  " + orders.map((x) => `${x.status}=${x._count._all} ($${x._sum.escrowAmount})`).join("  "));

  const tasks = await prisma.task.groupBy({ by: ["status"], _count: { _all: true } });
  console.log("tasks:   " + tasks.map((x) => `${x.status}=${x._count._all}`).join("  "));

  const settlements = await prisma.settlement.groupBy({ by: ["status"], _count: { _all: true } });
  console.log("settlements: " + settlements.map((x) => `${x.status}=${x._count._all}`).join("  "));
  console.log("disputes: " + (await prisma.dispute.count()));

  const users = await prisma.user.findMany({ select: { id: true, email: true, balance: true, frozenBalance: true } });
  const held = await prisma.order.groupBy({
    by: ["publisherId"],
    where: { status: { in: [...HOLDING] } },
    _sum: { escrowAmount: true },
  });
  const heldBy = new Map(held.map((h) => [h.publisherId, Number(h._sum.escrowAmount ?? 0)]));

  console.log("\nuser                              available     frozen   escrow-in-active-orders");
  for (const u of users) {
    const bal = Number(u.balance);
    const frozen = Number(u.frozenBalance);
    const h = heldBy.get(u.id) ?? 0;
    if (!bal && !frozen && !h) continue;
    const flag = Math.abs(frozen - h) > 0.004 ? "  <-- frozen does not match active orders" : "";
    console.log(`${u.email.padEnd(32)} ${bal.toFixed(2).padStart(11)} ${frozen.toFixed(2).padStart(10)} ${h.toFixed(2).padStart(10)}${flag}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
