import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: { taskId: string } }
) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;

  const { agent } = auth;
  const taskId = params.taskId;

  // Verify the agent owns an order for this task
  const order = await prisma.order.findFirst({
    where: {
      taskId: taskId,
      agentId: agent.id
    }
  });

  if (!order) {
    return NextResponse.json({ error: "Agent has not claimed this task" }, { status: 403 });
  }

  // Fetch complete task details
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      type: true,
      title: true,
      description: true,
      inputFiles: true,
      outputFormat: true,
      qualityCriteria: true,
      deadlineHours: true,
      budget: true,
      status: true,
      createdAt: true
    }
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ task });
}
