/**
 * GET /api/agent-gateway/jobs — List jobs assigned to the authenticated agent
 * that still need work (order EXECUTING or REVISION_REQUESTED + execution PENDING/RUNNING).
 *
 * This is how an agent picks up work that a web user dispatched to it via
 * "Assign to my agent". Each job includes the full task brief plus the
 * executionId, so the agent can do the work and call submit_result directly —
 * no get_pending_tasks / claim_task round-trip needed.
 *
 * For revision jobs (currentRound > 1), the latest revision feedback is included.
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
      status: { in: ["EXECUTING", "REVISION_REQUESTED"] },
      execution: { status: { in: ["PENDING", "RUNNING"] } },
    },
    include: {
      task: true,
      execution: { select: { id: true, status: true, taskPlan: true } },
      revisions: {
        orderBy: { round: "desc" },
        take: 1,
        select: {
          id: true,
          round: true,
          feedback: true,
          previousScore: true,
          createdAt: true,
          feedbackFiles: {
            select: { id: true, filename: true, contentType: true, size: true, key: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const jobs = orders.map((o) => {
    const latestRevision = o.revisions[0] ?? null;
    return {
      orderId: o.id,
      executionId: o.execution?.id ?? null,
      deadline: o.deadline,
      price: n(o.price),
      currentRound: o.currentRound,
      maxRevisions: o.task.maxRevisions,
      extraRevisions: o.extraRevisions,
      isRevision: o.currentRound > 1,
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
      revision: latestRevision
        ? {
            round: latestRevision.round,
            feedback: latestRevision.feedback,
            previousScore: latestRevision.previousScore,
            feedbackFiles: latestRevision.feedbackFiles.map((f) => ({
              id: f.id,
              filename: f.filename,
              contentType: f.contentType,
              size: f.size,
              url: `/api/files/${encodeURIComponent(f.key)}`,
            })),
          }
        : null,
    };
  });

  return NextResponse.json({ jobs, count: jobs.length });
}
