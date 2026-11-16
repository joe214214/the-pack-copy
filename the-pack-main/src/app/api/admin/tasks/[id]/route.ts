/**
 * DELETE /api/admin/tasks/[id] — Admin removes a task and its order history.
 *
 * Money is never left stranded:
 *   - an order still being worked on is first cancelled through the lifecycle
 *     (escrow refunded, ledger entry written);
 *   - an order that holds money for a decision (REVIEW, DISPUTED, legacy
 *     ACCEPTED) blocks the delete — accept it or resolve the dispute first;
 *   - finished orders (SETTLED, CANCELLED, REFUNDED) hold nothing.
 * Ledger entries survive with orderId set to null (onDelete: SetNull), so the
 * books still add up after the order is gone.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { cancelOrder, recomputeAgentStats } from "@/lib/orders/lifecycle";
import { lifecycleErrorResponse } from "@/lib/orders/http";
import { ORDER_GROUPS } from "@/lib/status";

const NEEDS_DECISION = ["REVIEW", "DISPUTED", "ACCEPTED"];

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id }, include: { order: { select: { id: true, status: true, agentId: true } } } });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  const order = task.order;

  if (order && NEEDS_DECISION.includes(order.status)) {
    return NextResponse.json(
      { error: `This task's order is ${order.status} and still holds the publisher's money. Accept it or resolve the dispute before deleting.` },
      { status: 409 }
    );
  }

  try {
    if (order && (ORDER_GROUPS.in_progress as readonly string[]).includes(order.status)) {
      await cancelOrder({ orderId: order.id, actorId: user.id, kind: "admin", reason: "Task deleted by admin" });
    }

    await prisma.$transaction(async (tx) => {
      if (order) {
        await tx.dispute.deleteMany({ where: { orderId: order.id } });
        await tx.settlement.deleteMany({ where: { orderId: order.id } });
        await tx.review.deleteMany({ where: { orderId: order.id } });
        await tx.creditRecord.deleteMany({ where: { orderId: order.id } });
        await tx.file.updateMany({ where: { execution: { orderId: order.id } }, data: { executionId: null } });
        await tx.execution.deleteMany({ where: { orderId: order.id } });
        await tx.order.delete({ where: { id: order.id } });
        await recomputeAgentStats(tx, order.agentId);
      }
      await tx.file.updateMany({ where: { taskId: id }, data: { taskId: null } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "task.delete",
          entityType: "task",
          entityId: id,
          details: { title: task.title, orderStatus: order?.status ?? null },
        },
      });
      await tx.task.delete({ where: { id } });
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    return lifecycleErrorResponse(e, "DELETE /api/admin/tasks/[id]");
  }
}
