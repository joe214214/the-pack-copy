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
import { z } from "zod";

const revisionSchema = z.object({
  feedback: z.string().min(1).max(5000),
  fileIds: z.array(z.string()).max(10).optional(),
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

      // 3. Reset execution for new work
      await tx.execution.update({
        where: { id: order.execution!.id },
        data: {
          status: "RUNNING",
          completedAt: null,
          // Keep previous taskPlan, logs, result for reference
          // Agent will overwrite on re-submit
        },
      });

      // 4. Update order
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: "REVISION_REQUESTED",
          currentRound: { increment: 1 },
          deadline: newDeadline,
        },
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
    console.error("Revision request error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
