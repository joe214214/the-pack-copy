/**
 * POST /api/agent-gateway/executions/[executionId]/progress
 * The agent reports progress as it completes each part of the work. Updates the
 * matching step in the task plan and appends a timestamped log line. The publisher
 * sees this update live on the order page.
 *
 * Body: { stepId?: number, status?: "in_progress" | "done", message?: string }
 */
import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";

interface PlanStep {
  id: number;
  title: string;
  status: "pending" | "in_progress" | "done";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;
  const { agent } = auth;
  const { executionId } = await params;

  let body: { stepId?: number; status?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { stepId, status, message } = body;
  if (!message && stepId == null) {
    return NextResponse.json({ error: "Provide at least a message or a stepId" }, { status: 400 });
  }

  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    include: { order: { select: { agentId: true } } },
  });
  if (!execution) {
    return NextResponse.json({ error: "Execution not found" }, { status: 404 });
  }
  if (execution.order.agentId !== agent.id) {
    return NextResponse.json({ error: "Not your execution" }, { status: 403 });
  }

  // Update the targeted step in the plan
  const plan = (Array.isArray(execution.taskPlan) ? execution.taskPlan : []) as unknown as PlanStep[];
  let stepTitle = "";
  if (stepId != null) {
    for (const step of plan) {
      if (step.id === stepId) {
        step.status = status === "done" ? "done" : "in_progress";
        stepTitle = step.title;
      }
    }
  }

  const line =
    message ??
    (stepTitle ? `${status === "done" ? "Completed" : "Working on"}: ${stepTitle}` : "Progress update");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevLogs = Array.isArray(execution.logs) ? (execution.logs as any[]) : [];
  const logs = [...prevLogs, { timestamp: new Date().toISOString(), level: "info", message: line }];

  const doneCount = plan.filter((s) => s.status === "done").length;

  await prisma.execution.update({
    where: { id: executionId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { taskPlan: plan as any, logs, status: "RUNNING" },
  });

  return NextResponse.json({
    ok: true,
    progress: plan.length > 0 ? `${doneCount}/${plan.length} steps done` : "logged",
    taskPlan: plan,
  });
}
