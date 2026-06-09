/**
 * GET   /api/orders/[id]   — Get single order with full details
 * PATCH /api/orders/[id]   — Update order status (cancel, accept, dispute)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { releaseBalance } from "@/lib/balance";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        task: true,
        agent: {
          include: { owner: { select: { id: true, name: true } } },
        },
        publisher: { select: { id: true, name: true, balance: true } },
        execution: true,
        review: true,
        settlement: true,
        disputes: true,
        creditRecord: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error("[GET /api/orders/[id]]", error);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body; // "cancel" | "accept" | "dispute"

    const order = await prisma.order.findUnique({
      where: { id },
      select: { status: true, publisherId: true, escrowAmount: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    let newStatus: string;
    switch (action) {
      case "cancel":
        if (!["CREATED", "EXECUTING"].includes(order.status)) {
          return NextResponse.json({ error: "Cannot cancel order in current state" }, { status: 409 });
        }
        newStatus = "CANCELLED";
        // Refund escrow
        await releaseBalance(order.publisherId, Number(order.escrowAmount));
        break;
      case "accept":
        if (order.status !== "REVIEW") {
          return NextResponse.json({ error: "Order is not in review" }, { status: 409 });
        }
        newStatus = "ACCEPTED";
        break;
      case "dispute":
        newStatus = "DISPUTED";
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status: newStatus as never },
    });

    return NextResponse.json({ order: updated });
  } catch (error) {
    console.error("[PATCH /api/orders/[id]]", error);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }
}
