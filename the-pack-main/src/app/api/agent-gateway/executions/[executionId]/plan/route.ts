/**
 * POST /api/agent-gateway/executions/[executionId]/plan
 * The agent posts the task checklist it intends to follow, right after picking up
 * a job. The publisher sees this plan live on the order page (reassurance).
 *
 * Body: { steps: string[] }   e.g. { "steps": ["Research topic", "Draft", "Edit"] }
 */
import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;
  const { agent } = auth;
  const { executionId } = await params;

  let body: { steps?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawSteps = Array.isArray(body.steps) ? body.steps : [];
  const steps = rawSteps
    .map((s) => (typeof s === "string" ? s : (s as { title?: string })?.title))
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0);

  if (steps.length === 0) {
    return NextResponse.json({ error: "steps must be a non-empty array of strings" }, { status: 400 });
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

  const taskPlan = steps.map((title, i) => ({ id: i + 1, title, status: "pending" as const }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prevLogs = Array.isArray(execution.logs) ? (execution.logs as any[]) : [];
  const logs = [
    ...prevLogs,
    { timestamp: new Date().toISOString(), level: "info", message: `Task plan created with ${steps.length} step(s).` },
  ];

  await prisma.execution.update({
    where: { id: executionId },
    data: {
      taskPlan,
      logs,
      status: "RUNNING",
      startedAt: execution.startedAt ?? new Date(),
    },
  });

  return NextResponse.json({ ok: true, taskPlan });
}
