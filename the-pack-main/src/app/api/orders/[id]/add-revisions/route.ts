/**
 * POST /api/orders/[id]/add-revisions  — Purchase extra revision rounds
 *
 * Body: { rounds: number }
 *
 * Cost = rounds × 10% of the order price. The money goes INTO the order's
 * escrow (ledger EXTRA_REVISION), so the agent owner is paid for the extra work
 * on settlement and the publisher gets it back if the order is cancelled.
 * (It used to be debited from the publisher and credited to nobody.)
 * Cap: total extraRevisions ≤ task.maxRevisions.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { buyExtraRevisions } from "@/lib/orders/lifecycle";
import { lifecycleErrorResponse } from "@/lib/orders/http";
import { z } from "zod";

const addRevisionsSchema = z.object({
  rounds: z.number().int().min(1).max(10),
});

/** Cost per extra revision round, as a fraction of the order price. */
const EXTRA_REVISION_RATE = 0.1;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = addRevisionsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 422 });
  }
  const { rounds } = parsed.data;

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { task: true } });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.publisherId !== user.id) {
    return NextResponse.json({ error: "Only the publisher can purchase extra revisions" }, { status: 403 });
  }

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

  const costPerRound = Math.round(Number(order.price) * EXTRA_REVISION_RATE * 100) / 100;
  try {
    const { cost } = await buyExtraRevisions({ orderId, actorId: user.id, rounds, costPerRound });
    return NextResponse.json({
      success: true,
      roundsAdded: rounds,
      costCharged: cost,
      newExtraRevisions: newExtra,
      totalAllowed: order.task.maxRevisions + newExtra,
    });
  } catch (e) {
    return lifecycleErrorResponse(e, "POST /api/orders/[id]/add-revisions");
  }
}
