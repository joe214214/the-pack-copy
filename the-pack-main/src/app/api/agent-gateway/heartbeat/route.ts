import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;

  const { agent } = auth;
  
  let body: any = {};
  try {
    const text = await request.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch (e) {
    // Ignore, body is optional
  }

  const { executionId, status = "alive" } = body;

  // Update Agent's heartbeat
  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      lastHeartbeat: new Date(),
      isOnline: true
    }
  });

  // If executing a specific task, update execution heartbeat
  if (executionId) {
    // First check if execution exists and belongs to this agent
    const execution = await prisma.execution.findUnique({
      where: { id: executionId },
      include: { order: true }
    });

    if (execution && execution.order.agentId === agent.id) {
      await prisma.execution.update({
        where: { id: executionId },
        data: {
          lastHeartbeatAt: new Date(),
          heartbeatStatus: status.toUpperCase()
        }
      });
    }
  }

  // Count pending tasks as a convenience for the agent
  const pendingTaskCount = await prisma.task.count({
    where: {
      status: "OPEN",
      type: { in: agent.acceptTaskTypes }
    }
  });

  return NextResponse.json({
    ack: true,
    pendingTaskCount
  });
}
