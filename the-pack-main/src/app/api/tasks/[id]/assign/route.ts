/**
 * POST /api/tasks/[id]/assign — A logged-in user assigns an OPEN task to one of
 * THEIR OWN agents. Creates an Order bound to that agent (agentId set, no human
 * claimer) + an Execution, and freezes the publisher's escrow. The owner's agent
 * then picks the job up via the gateway (`GET /api/agent-gateway/jobs`) and
 * submits the result itself — no manual copy-paste.
 *
 * Body: { agentId }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { calculateFees } from "@/lib/fees";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: taskId } = await params;

    let body: { agentId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const agentId = body.agentId;
    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    // Verify the agent belongs to the current user and is usable
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent || (agent.ownerId !== user.id && !user.isAdmin)) {
      return NextResponse.json({ error: "Agent not found or not yours" }, { status: 403 });
    }
    if (agent.status !== "ACTIVE") {
      return NextResponse.json({ error: "Agent is not active" }, { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: taskId },
        include: { order: true },
      });

      if (!task) throw new Error("Task not found");
      if (task.status !== "OPEN") throw new Error(`Task is ${task.status}, not available`);
      if (task.order) throw new Error("Task has already been claimed");
      if (task.publisherId === user.id) throw new Error("You cannot work your own task");
      if (!agent.supportedTaskTypes.includes(task.type)) {
        throw new Error(`Agent does not support ${task.type}`);
      }

      const price = Number(task.budget);
      const { platformFee, escrowAmount } = calculateFees(price);

      const publisher = await tx.user.findUnique({
        where: { id: task.publisherId },
        select: { balance: true },
      });
      if (!publisher || Number(publisher.balance) < escrowAmount) {
        throw new Error("Publisher has insufficient balance to fund this task");
      }
      await tx.user.update({
        where: { id: task.publisherId },
        data: {
          balance: { decrement: escrowAmount },
          frozenBalance: { increment: escrowAmount },
        },
      });

      await tx.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });

      const deadline = new Date(Date.now() + task.deadlineHours * 60 * 60 * 1000);

      const order = await tx.order.create({
        data: {
          taskId: task.id,
          agentId: agent.id,
          publisherId: task.publisherId,
          price,
          platformFee,
          escrowAmount,
          paymentMethod: "BALANCE",
          status: "EXECUTING",
          deadline,
        },
      });

      const execution = await tx.execution.create({
        data: {
          orderId: order.id,
          executionSource: agent.connectionType,
          status: "PENDING",
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "task.assign",
          entityType: "order",
          entityId: order.id,
          details: { taskId, agentId: agent.id },
        },
      });

      return { orderId: order.id, executionId: execution.id };
    });

    return NextResponse.json({ status: "assigned", agentId, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to assign task";
    console.error("[POST /api/tasks/[id]/assign]", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
