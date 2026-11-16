/**
 * Brings Task.status in line with its order, for rows written before the
 * order lifecycle module existed (old code never closed a task).
 *   order SETTLED              -> task COMPLETED
 *   order CANCELLED / REFUNDED -> task CANCELLED
 *   any other order            -> task IN_PROGRESS
 * Touches Task.status only — no money, no orders.
 *
 *   npx tsx --env-file=.env scripts/repair-task-status.ts          # dry run
 *   npx tsx --env-file=.env scripts/repair-task-status.ts --apply
 */
import { prisma } from "../src/lib/prisma";

const expected = (s: string) =>
  s === "SETTLED" ? "COMPLETED" : s === "CANCELLED" || s === "REFUNDED" ? "CANCELLED" : "IN_PROGRESS";

async function main() {
  const apply = process.argv.includes("--apply");
  const orders = await prisma.order.findMany({ select: { status: true, task: { select: { id: true, title: true, status: true } } } });
  const fixes = orders
    .map((o) => ({ ...o.task, want: expected(o.status) as "COMPLETED" | "CANCELLED" | "IN_PROGRESS", orderStatus: o.status }))
    .filter((t) => t.status !== t.want);

  for (const t of fixes) console.log(`${apply ? "fix " : "would"}  "${t.title}"  ${t.status} -> ${t.want}  (order ${t.orderStatus})`);
  if (apply && fixes.length) {
    await prisma.$transaction(fixes.map((t) => prisma.task.update({ where: { id: t.id }, data: { status: t.want } })));
  }
  console.log(`\n${apply ? "Updated" : "Dry run:"} ${fixes.length} task(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
