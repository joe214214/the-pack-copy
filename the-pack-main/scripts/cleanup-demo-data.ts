/**
 * Removes the tasks left behind by development — sandbox probes, CLI A/B runs,
 * junk titles, duplicates — so the marketplace reads as a marketplace.
 *
 *   npx tsx --env-file=.env scripts/cleanup-demo-data.ts          # dry run
 *   npx tsx --env-file=.env scripts/cleanup-demo-data.ts --apply  # delete
 *
 * Everything removed is written to scripts/.deleted-tasks.json first, so a
 * mistake is recoverable.
 */
import { prisma } from "../src/lib/prisma";
import { writeFileSync } from "node:fs";

/** Titles that only ever existed to exercise the pipeline. */
const JUNK = [
  /\btest\b/i,
  /\bsandbox\b/i,
  /dry-run/i,
  /^change colour$/i,
  /^\d+$/,                    // "111111111"
  /\uFFFD/,                   // mangled characters
  /\[(noskill|appleskill|sonnet-[a-z0-9-]+|fullpage|demo)\]/i,
  /^progress demo/i,
  /^simple ui v[234]/i,       // keep only the first of the increments
];

async function main() {
  const apply = process.argv.includes("--apply");

  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true, createdAt: true },
  });

  const seen = new Set<string>();
  const doomed: typeof tasks = [];
  const kept: typeof tasks = [];

  for (const t of tasks) {
    const junk = JUNK.some((re) => re.test(t.title));
    // Same title twice is a re-run; keep the newest (list is newest-first).
    const dupe = seen.has(t.title.trim().toLowerCase());
    seen.add(t.title.trim().toLowerCase());
    if (junk || dupe) doomed.push(t);
    else kept.push(t);
  }

  console.log(`删除 ${doomed.length} 个：\n`);
  for (const t of doomed) console.log(`  - ${t.title.slice(0, 62)}`);
  console.log(`\n保留 ${kept.length} 个：\n`);
  for (const t of kept) console.log(`  ✓ ${t.title.slice(0, 62)}`);

  if (!apply) {
    console.log("\n演练，未改动任何数据。加 --apply 执行。");
    await prisma.$disconnect();
    return;
  }

  const backup = await prisma.task.findMany({
    where: { id: { in: doomed.map((t) => t.id) } },
    include: { order: { include: { execution: true, review: true, settlement: true, revisions: true } }, files: true },
  });
  writeFileSync("scripts/.deleted-tasks.json", JSON.stringify(backup, null, 2));
  console.log(`\n已备份到 scripts/.deleted-tasks.json`);

  // Only Revision cascades from Order in the schema; everything else has a
  // plain foreign key, so the rows come out in dependency order by hand.
  const taskIds = doomed.map((t) => t.id);
  const orders = await prisma.order.findMany({
    where: { taskId: { in: taskIds } },
    select: { id: true, execution: { select: { id: true } } },
  });
  const orderIds = orders.map((o) => o.id);
  const executionIds = orders.map((o) => o.execution?.id).filter((v): v is string => !!v);

  await prisma.$transaction([
    // Files point at a task, an execution or a revision — detach all three.
    prisma.file.deleteMany({
      where: {
        OR: [
          { taskId: { in: taskIds } },
          { executionId: { in: executionIds } },
          { revision: { orderId: { in: orderIds } } },
        ],
      },
    }),
    prisma.dispute.deleteMany({ where: { orderId: { in: orderIds } } }),
    prisma.creditRecord.deleteMany({ where: { orderId: { in: orderIds } } }),
    prisma.settlement.deleteMany({ where: { orderId: { in: orderIds } } }),
    prisma.review.deleteMany({ where: { orderId: { in: orderIds } } }),
    prisma.execution.deleteMany({ where: { orderId: { in: orderIds } } }),
    prisma.order.deleteMany({ where: { id: { in: orderIds } } }),
    prisma.task.deleteMany({ where: { id: { in: taskIds } } }),
  ]);
  console.log(`已删除 ${taskIds.length} 个任务、${orderIds.length} 个订单及其执行/评价/结算记录。`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
