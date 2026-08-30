/**
 * POST /api/orders/[id]/add-revisions  — Purchase extra revision rounds
 *
 * Body: { rounds: number }
 *
 * Deducts (rounds × 10% of task budget) from publisher balance and adds
 * the rounds to order.extraRevisions.
 * Constraint: total extraRevisions ≤ task.maxRevisions (configurable cap).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";

const addRevisionsSchema = z.object({
  rounds: z.number().int().min(1).max(10),
});

// Cost per extra revision round = 10% of task budget
const EXTRA_REVISION_RATE = 0.10;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { rounds } = addRevisionsSchema.parse(body);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { task: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.publisherId !== user.id) {
      return NextResponse.json(
        { error: "Only the publisher can purchase extra revisions" },
        { status: 403 }
      );
    }

    // Only allow while order is in a reviewable/revisable state
    const allowedStatuses = ["REVIEW", "REVISION_REQUESTED", "EXECUTING"];
    if (!allowedStatuses.includes(order.status)) {
      return NextResponse.json(
        { error: `Cannot add revisions when order status is ${order.status}` },
        { status: 409 }
      );
    }

    // Check cap: extraRevisions ≤ maxRevisions (soft cap, system supports any value)
    const newExtra = order.extraRevisions + rounds;
    if (newExtra > order.task.maxRevisions) {
      return NextResponse.json(
        {
          error: `Extra revisions would exceed the cap (max ${order.task.maxRevisions} extra). Current extra: ${order.extraRevisions}.`,
          maxExtra: order.task.maxRevisions,
          currentExtra: order.extraRevisions,
        },
        { status: 409 }
      );
    }

    // Calculate cost
    const taskBudget = Number(order.task.budget);
    const costPerRound = taskBudget * EXTRA_REVISION_RATE;
    const totalCost = costPerRound * rounds;

    // Deduct from publisher balance (not frozen — this is a service fee, not escrow)
    const publisher = await prisma.user.findUnique({ where: { id: user.id } });
    if (!publisher || Number(publisher.balance) < totalCost) {
      return NextResponse.json(
        {
          error: `Insufficient balance. Need $${totalCost.toFixed(2)}, have $${Number(publisher?.balance ?? 0).toFixed(2)}.`,
          required: totalCost,
          available: Number(publisher?.balance ?? 0),
        },
        { status: 402 }
      );
    }

    // Transaction: deduct balance + add rounds
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { balance: { decrement: totalCost } },
      });

      await tx.order.update({
        where: { id: orderId },
        data: { extraRevisions: { increment: rounds } },
      });
    });

    return NextResponse.json({
      success: true,
      roundsAdded: rounds,
      costCharged: totalCost,
      newExtraRevisions: newExtra,
      totalAllowed: order.task.maxRevisions + newExtra,
    });
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return NextResponse.json({ error: "Invalid input", details: err.errors }, { status: 422 });
    }
    console.error("Add revisions error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
