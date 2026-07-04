/**
 * GET /api/agent-gateway/jobs — List jobs assigned to the authenticated agent
 * that still need work (order EXECUTING + execution PENDING/RUNNING).
 *
 * This is how an agent picks up work that a web user dispatched to it via
 * "Assign to my agent". Each job includes the full task brief plus the
 * executionId, so the agent can do the work and call submit_result directly —
 * no get_pending_tasks / claim_task round-trip needed.
 */
import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";

const n = (v: unknown) => Number(v ?? 0);

export async function GET(request: Request) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;
  const { agent } = auth;

  const orders = await prisma.order.findMany({
    where: {
      agentId: agent.id,
      status: "EXECUTING",
      execution: { status: { in: ["PENDING", "RUNNING"] } },
    },
    include: {
      task: true,
      execution: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const jobs = orders.map((o) => ({
    orderId: o.id,
    executionId: o.execution?.id ?? null,
    deadline: o.deadline,
    price: n(o.price),
    task: {
      id: o.task.id,
      type: o.task.type,
      title: o.task.title,
      description: o.task.description,
      outputFormat: o.task.outputFormat,
      inputFiles: o.task.inputFiles,
      qualityCriteria: o.task.qualityCriteria,
      deadlineHours: o.task.deadlineHours,
    },
  }));

  return NextResponse.json({ jobs, count: jobs.length });
}
