/**
 * GET   /api/orders/[id]   — Order with full details. Visible to the publisher,
 *                             the executing agent's owner, and admins.
 * PATCH /api/orders/[id]   — { action: "cancel" | "accept" | "dispute", reason?, rating? }
 *
 * The response carries `viewer`: { isPublisher, isAgentOwner, isAdmin,
 * can: { cancel, review } } so the page shows only the actions this user may take.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { acceptOrder, cancelOrder, disputeOrder } from "@/lib/orders/lifecycle";
import { lifecycleErrorResponse } from "@/lib/orders/http";

/** Statuses in which the publisher may still cancel (before anything was delivered). */
const PUBLISHER_CANCELLABLE = ["CREATED", "FUNDED", "EXECUTING"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        task: true,
        agent: {
          include: { owner: { select: { id: true, name: true } } },
        },
        publisher: { select: { id: true, name: true } },
        execution: true,
        review: true,
        settlement: true,
        disputes: true,
        creditRecord: true,
        revisions: {
          orderBy: { round: "asc" },
          include: {
            feedbackFiles: {
              select: { id: true, filename: true, contentType: true, size: true, key: true },
            },
          },
        },
      },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const isPublisher = order.publisherId === user.id;
    const isAgentOwner = order.agent.ownerId === user.id;
    if (!isPublisher && !isAgentOwner && !user.isAdmin) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    // An agent's API key is a credential: never send it to the browser.
    const { apiKey: _apiKey, ...agent } = order.agent;
    void _apiKey;

    return NextResponse.json({
      order: { ...order, agent },
      viewer: {
        isPublisher,
        isAgentOwner,
        isAdmin: user.isAdmin,
        can: {
          cancel: (isPublisher || user.isAdmin) && PUBLISHER_CANCELLABLE.includes(order.status) && order.currentRound === 1,
          review: (isPublisher || user.isAdmin) && order.status === "REVIEW",
        },
      },
    });
  } catch (error) {
    console.error("[GET /api/orders/[id]]", error);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { action, reason, rating } = body as { action?: string; reason?: string; rating?: number };

  const order = await prisma.order.findUnique({
    where: { id },
    select: { status: true, publisherId: true, currentRound: true },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.publisherId !== user.id && !user.isAdmin) {
    return NextResponse.json({ error: "Only the publisher can change this order" }, { status: 403 });
  }

  try {
    switch (action) {
      case "cancel":
        // Once something has been delivered the publisher reviews it (accept,
        // revise or dispute) instead of walking away with a full refund.
        if (!user.isAdmin && (!PUBLISHER_CANCELLABLE.includes(order.status) || order.currentRound !== 1)) {
          return NextResponse.json({ error: "This order can no longer be cancelled; review or dispute the delivery instead" }, { status: 409 });
        }
        await cancelOrder({ orderId: id, actorId: user.id, kind: user.isAdmin && order.publisherId !== user.id ? "admin" : "cancel", reason: reason || "Cancelled by publisher" });
        break;
      case "accept":
        await acceptOrder({ orderId: id, actorId: user.id, rating });
        break;
      case "dispute":
        await disputeOrder({ orderId: id, actorId: user.id, reason });
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (e) {
    return lifecycleErrorResponse(e, "PATCH /api/orders/[id]");
  }

  const updated = await prisma.order.findUnique({ where: { id }, select: { id: true, status: true } });
  return NextResponse.json({ order: updated });
}
