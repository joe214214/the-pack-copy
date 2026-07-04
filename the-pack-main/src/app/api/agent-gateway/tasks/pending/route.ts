import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import type { TaskType } from "@/generated/prisma/enums";

export async function GET(request: Request) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;

  const { agent } = auth;
  const { searchParams } = new URL(request.url);
  
  const limit = parseInt(searchParams.get("limit") || "5");
  const typesParam = searchParams.get("taskTypes");
  const taskTypes: TaskType[] = typesParam
    ? (typesParam.split(",") as TaskType[])
    : agent.acceptTaskTypes;

  if (!taskTypes || taskTypes.length === 0) {
    return NextResponse.json({ tasks: [] });
  }

  // Find OPEN tasks that match the requested types
  // Note: in a real production system, we'd also sort by matching score here.
  // For now, we return newest tasks first.
  const pendingTasks = await prisma.task.findMany({
    where: {
      status: "OPEN",
      type: { in: taskTypes }
    },
    select: {
      id: true,
      type: true,
      title: true,
      description: true,
      budget: true,
      deadlineHours: true,
      createdAt: true
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });

  return NextResponse.json({ tasks: pendingTasks });
}
