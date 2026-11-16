/**
 * POST /api/reviews/[orderId]/revision  — Publisher requests a revision
 *
 * Body: { feedback: string, fileIds?: string[] }
 *
 * Creates a Revision record, snapshots the current delivery, resets the
 * execution to RUNNING, sets Order to REVISION_REQUESTED, bumps currentRound,
 * and optionally resets the deadline to 50 % of the original.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { MAX_TASK_FILES } from "@/lib/storage";
import { z } from "zod";
import { LifecycleError, markRevisionRequested } from "@/lib/orders/lifecycle";
import { lifecycleErrorResponse } from "@/lib/orders/http";

const revisionSchema = z.object({
  feedback: z.string().min(1).max(5000),
  fileIds: z.array(z.string()).max(MAX_TASK_FILES).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { feedback, fileIds } = revisionSchema.parse(body);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        task: true,
        execution: true,
        review: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.publisherId !== user.id && !user.isAdmin) {
      return NextResponse.json(
        { error: "Only the task publisher can request revisions" },
        { status: 403 }
      );
    }
    if (order.status !== "REVIEW") {
      return NextResponse.json(
        { error: "Order is not in review status" },
        { status: 409 }
      );
    }

    // Check revision limits: total allowed = maxRevisions + extraRevisions
    const maxAllowed = order.task.maxRevisions + order.extraRevisions;
    if (order.currentRound > maxAllowed) {
      return NextResponse.json(
        {
          error: `Maximum revisions reached (${maxAllowed}). You can purchase additional rounds or accept/dispute.`,
          currentRound: order.currentRound,
          maxAllowed,
        },
        { status: 409 }
      );
    }

    if (!order.execution) {
      return NextResponse.json(
        { error: "No execution found for this order" },
        { status: 404 }
      );
    }

    // Snapshot the current delivery
    const previousScore = order.review?.autoScore
      ? Number(order.review.autoScore)
      : undefined;
    const previousFiles = order.execution.outputFiles ?? undefined;

    // Calculate new deadline (50% of original, min 1 hour)
    const revisionHours = Math.max(1, Math.ceil(order.task.deadlineHours / 2));
    const newDeadline = new Date(Date.now() + revisionHours * 60 * 60 * 1000);

    // Transaction: create revision, reset execution, update order
    const revision = await prisma.$transaction(async (tx) => {
      // 1. Create Revision record
      const rev = await tx.revision.create({
        data: {
          orderId,
          round: order.currentRound, // the round being revised
          feedback,
          previousScore,
          previousFiles: previousFiles ?? undefined,
        },
      });

      // 2. Link any feedback files to this revision
      if (fileIds && fileIds.length > 0) {
        // Verify all files exist and belong to this user
        const files = await tx.file.findMany({
          where: { id: { in: fileIds }, uploadedById: user.id },
        });
        if (files.length !== fileIds.length) {
          throw new Error("Some feedback files not found or not owned by you");
        }
        await tx.file.updateMany({
          where: { id: { in: fileIds } },
          data: { revisionId: rev.id },
        });
      }

      // 3+4. Order REVIEW -> REVISION_REQUESTED (compare-and-set, so a second
      // concurrent request cannot add a round) and execution back to RUNNING.
      // Previous taskPlan / logs are kept for reference; the agent overwrites
      // them on re-submit.
      await markRevisionRequested(tx, {
        orderId,
        executionId: order.execution!.id,
        deadline: newDeadline,
      });

      return rev;
    });

    return NextResponse.json({
      success: true,
      revision: {
        id: revision.id,
        round: revision.round,
        feedback: revision.feedback,
        currentRound: order.currentRound + 1,
        maxAllowed: order.task.maxRevisions + order.extraRevisions,
        newDeadline,
      },
    });
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return NextResponse.json({ error: "Invalid input", details: err.errors }, { status: 422 });
    }
    if (err instanceof LifecycleError) return lifecycleErrorResponse(err, "POST /api/reviews/[orderId]/revision");
    console.error("Revision request error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
