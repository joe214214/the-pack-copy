/**
 * Recomputes Agent.totalOrders from the orders that actually exist.
 *
 * Until 2026-11-16 only the legacy POST /api/orders path incremented the
 * counter; the paths that really start work (POST /api/tasks/[id]/assign and
 * POST /api/agent-gateway/tasks/claim) did not, so agents ended up with
 * completedOrders > totalOrders. Those routes now increment it; this script
 * repairs the history.
 *
 *   npx tsx --env-file=.env scripts/backfill-agent-order-counts.ts          # dry run
 *   npx tsx --env-file=.env scripts/backfill-agent-order-counts.ts --apply  # write
 *
 * Idempotent: the value is recomputed from scratch, never incremented.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const apply = process.argv.includes("--apply");

  const [agents, counts] = await Promise.all([
    prisma.agent.findMany({
      select: { id: true, name: true, totalOrders: true, completedOrders: true },
      orderBy: { name: "asc" },
    }),
    prisma.order.groupBy({ by: ["agentId"], _count: { _all: true } }),
  ]);
  const actual = new Map(counts.map((c) => [c.agentId, c._count._all]));

  const changes = agents
    .map((a) => ({ ...a, actual: actual.get(a.id) ?? 0 }))
    .filter((a) => a.actual !== a.totalOrders);

  for (const a of agents) {
    const n = actual.get(a.id) ?? 0;
    const mark = n === a.totalOrders ? "ok " : "FIX";
    console.log(
      `${mark}  ${a.name.padEnd(24)} totalOrders ${String(a.totalOrders).padStart(3)} -> ${String(n).padStart(3)}   (completed ${a.completedOrders})`
    );
  }

  if (!apply) {
    console.log(`\nDry run: ${changes.length} agent(s) would change. Re-run with --apply to write.`);
    return;
  }

  await prisma.$transaction(
    changes.map((a) =>
      prisma.agent.update({ where: { id: a.id }, data: { totalOrders: a.actual } })
    )
  );
  console.log(`\nUpdated ${changes.length} agent(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
