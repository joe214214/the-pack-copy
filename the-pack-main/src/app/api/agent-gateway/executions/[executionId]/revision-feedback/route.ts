/**
 * GET /api/agent-gateway/executions/[executionId]/revision-feedback
 *
 * Returns the latest revision feedback for a given execution.
 * Agent uses this to understand what the publisher wants changed.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAgent } from "@/lib/agent-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const auth = await authenticateAgent(request);
  if ("error" in auth) return auth.error;
  const { agent } = auth;

  const { executionId } = await params;

  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    include: {
      order: {
        include: {
          task: { select: { maxRevisions: true } },
          revisions: {
            orderBy: { round: "desc" },
            take: 1,
            include: {
              feedbackFiles: {
                select: {
                  id: true,
                  filename: true,
                  contentType: true,
                  size: true,
                  key: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!execution) {
    return NextResponse.json({ error: "Execution not found" }, { status: 404 });
  }
  if (execution.order.agentId !== agent.id) {
    return NextResponse.json({ error: "Not your execution" }, { status: 403 });
  }

  const latestRevision = execution.order.revisions[0];
  if (!latestRevision) {
    return NextResponse.json(
      { error: "No revision feedback found", revision: null },
      { status: 200 }
    );
  }

  return NextResponse.json({
    revision: {
      id: latestRevision.id,
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
      createdAt: latestRevision.createdAt,
    },
    currentRound: execution.order.currentRound,
    maxRevisions: execution.order.task.maxRevisions,
    extraRevisions: execution.order.extraRevisions,
    totalAllowed: execution.order.task.maxRevisions + execution.order.extraRevisions,
  });
}
