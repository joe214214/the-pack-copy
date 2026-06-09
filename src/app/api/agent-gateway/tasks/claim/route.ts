import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { freezeBalance } from "@/lib/balance";
import { calculateFees } from "@/lib/fees";

export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;

  const { agent } = auth;
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { taskId } = body;
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  if (!agent.isOnline) {
    return NextResponse.json({ error: "Agent is offline" }, { status: 403 });
  }

  if (agent.dailyCompleted >= agent.dailyLimit) {
    return NextResponse.json({ error: "Daily limit reached" }, { status: 429 });
  }

  // Use a transaction to safely claim the task
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Check if task is OPEN
      const task = await tx.task.findUnique({
        where: { id: taskId }
      });

      if (!task || task.status !== "OPEN") {
        throw new Error("Task is not available");
      }

      // 2. Calculate fees based on agent's base price
      // In a real system, we might negotiate or use task budget, but we'll use agent's price here.
      // Make sure the agent's price isn't > task budget
      const agentPrice = Number(agent.basePrice);
      if (agentPrice > Number(task.budget)) {
        throw new Error("Agent price exceeds task budget");
      }

      const { platformFee, escrowAmount } = calculateFees(agentPrice);

      // 3. Freeze publisher's balance
      // We do this outside the transaction or inside? 
      // freezeBalance does its own update, but it's fine to let it run.
      // Actually, balance check should be done inside transaction but we can call it here.
      const publisher = await tx.user.findUnique({ where: { id: task.publisherId } });
      if (!publisher || Number(publisher.balance) < escrowAmount) {
        throw new Error("Publisher has insufficient balance");
      }

      // Decrement available, increment frozen
      await tx.user.update({
        where: { id: task.publisherId },
        data: {
          balance: { decrement: escrowAmount },
          frozenBalance: { increment: escrowAmount }
        }
      });

      // 4. Update task status
      await tx.task.update({
        where: { id: taskId },
        data: { status: "IN_PROGRESS" }
      });

      // 5. Create Order
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + task.deadlineHours);

      const order = await tx.order.create({
        data: {
          taskId: task.id,
          agentId: agent.id,
          publisherId: task.publisherId,
          price: agentPrice,
          platformFee,
          escrowAmount,
          paymentMethod: "BALANCE",
          status: "EXECUTING",
          deadline
        }
      });

      // 6. Create Execution
      const execution = await tx.execution.create({
        data: {
          orderId: order.id,
          executionSource: agent.connectionType,
          status: "PENDING"
        }
      });

      return { orderId: order.id, executionId: execution.id };
    });

    return NextResponse.json({ 
      status: "claimed", 
      orderId: result.orderId, 
      executionId: result.executionId 
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
