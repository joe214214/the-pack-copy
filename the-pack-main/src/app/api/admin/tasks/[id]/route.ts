/**
 * DELETE /api/admin/tasks/[id] — Admin removes a task.
 * If the task has an active order, its escrow is refunded and the order/execution
 * /review records are removed first so the task can be safely deleted.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { releaseBalance } from "@/lib/balance";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: { order: { include: { execution: true, review: true, settlement: true, disputes: true } } },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const order = task.order;
      if (order) {
        // Refund any still-frozen escrow to the publisher (active, non-settled orders)
        if (["CREATED", "FUNDED", "EXECUTING", "REVIEW", "DISPUTED"].includes(order.status)) {
          await releaseBalance(order.publisherId, Number(order.escrowAmount));
        }
        // Remove dependent records before the order
        if (order.disputes.length > 0) {
          await tx.dispute.deleteMany({ where: { orderId: order.id } });
        }
        if (order.settlement) {
          await tx.settlement.delete({ where: { orderId: order.id } });
        }
        if (order.review) {
          await tx.review.delete({ where: { orderId: order.id } });
        }
        if (order.execution) {
          await tx.creditRecord.deleteMany({ where: { orderId: order.id } });
          await tx.execution.delete({ where: { orderId: order.id } });
        } else {
          await tx.creditRecord.deleteMany({ where: { orderId: order.id } });
        }
        await tx.order.delete({ where: { id: order.id } });
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "task.delete",
          entityType: "task",
          entityId: id,
          details: { title: task.title, hadOrder: !!order },
        },
      });

      await tx.task.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/admin/tasks/[id]]", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
