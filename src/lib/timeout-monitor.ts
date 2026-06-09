import { prisma } from "@/lib/prisma";
import { releaseBalance } from "@/lib/balance";

export async function checkTimeouts() {
  console.log("[TimeoutMonitor] Checking for expired orders...");
  const now = new Date();

  // Find orders that are still IN_PROGRESS but past their deadline
  const expiredOrders = await prisma.order.findMany({
    where: {
      status: "IN_PROGRESS",
      deadline: { lt: now }
    },
    include: { execution: true }
  });

  for (const order of expiredOrders) {
    console.log(`[TimeoutMonitor] Order ${order.id} expired. Cancelling...`);

    try {
      await prisma.$transaction(async (tx) => {
        // 1. Update Order status
        await tx.order.update({
          where: { id: order.id },
          data: { status: "CANCELLED" }
        });

        // 2. Update Execution status (if exists)
        if (order.execution) {
          await tx.execution.update({
            where: { id: order.execution.id },
            data: {
              status: "FAILED",
              errorMessage: "Execution timed out. Agent did not submit result in time.",
              completedAt: now
            }
          });
        }

        // 3. Update Task status back to MATCHED (or OPEN? let's do MATCHED to allow re-trigger or publisher intervention, actually OPEN makes it available again. Let's do OPEN)
        await tx.task.update({
          where: { id: order.taskId },
          data: { status: "OPEN" }
        });

        // 4. Release escrowed funds back to publisher
        await releaseBalance(order.publisherId, Number(order.escrowAmount));

        // 5. Audit log
        await tx.auditLog.create({
          data: {
            actorId: "SYSTEM",
            action: "order.timeout",
            entityType: "order",
            entityId: order.id,
            details: { reason: "Deadline exceeded" }
          }
        });
      });
      console.log(`[TimeoutMonitor] Successfully cancelled order ${order.id} and refunded publisher.`);
    } catch (error) {
      console.error(`[TimeoutMonitor] Failed to process timeout for order ${order.id}:`, error);
    }
  }
}
