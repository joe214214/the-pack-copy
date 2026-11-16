/**
 * POST /api/reviews/[orderId]  — Publisher's verdict on a delivery.
 *
 * Body: { accepted: boolean, rating?: 1-5, comment?: string }
 *   accepted = true  -> acceptOrder(): settles (escrow -> agent owner minus the
 *                       platform fee), closes the task, updates reputation
 *   accepted = false -> disputeOrder(): funds stay in escrow until an admin
 *                       resolves the dispute
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { acceptOrder, disputeOrder } from "@/lib/orders/lifecycle";
import { lifecycleErrorResponse } from "@/lib/orders/http";
import { z } from "zod";

const reviewSchema = z.object({
  accepted: z.boolean(),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 422 });
  }
  const { accepted, rating, comment } = parsed.data;

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { publisherId: true } });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.publisherId !== user.id && !user.isAdmin) {
    return NextResponse.json({ error: "Only the task publisher can review this order" }, { status: 403 });
  }

  try {
    if (accepted) {
      const settled = await acceptOrder({ orderId, actorId: user.id, rating, comment });
      return NextResponse.json({ success: true, accepted, settlement: settled });
    }
    const { disputeId } = await disputeOrder({ orderId, actorId: user.id, reason: comment });
    return NextResponse.json({ success: true, accepted, disputeId });
  } catch (e) {
    return lifecycleErrorResponse(e, "POST /api/reviews/[orderId]");
  }
}
