/**
 * GET /api/executions/[orderId]  — Execution status + logs for an order.
 * Visible to the order's publisher, the agent's owner, and admins.
 *
 * (POST, which created an execution for a legacy CREATED order without ever
 * moving the order to EXECUTING, is gone: work now starts in openOrder() —
 * see src/lib/orders/lifecycle.ts — which creates the execution itself.)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orderId } = await params;

  const execution = await prisma.execution.findUnique({
    where: { orderId },
    include: { order: { select: { publisherId: true, agent: { select: { ownerId: true } } } } },
  });
  if (
    !execution ||
    (execution.order.publisherId !== user.id && execution.order.agent.ownerId !== user.id && !user.isAdmin)
  ) {
    return NextResponse.json({ error: "Execution not found" }, { status: 404 });
  }

  const { order: _order, ...rest } = execution;
  void _order;
  return NextResponse.json({ execution: rest });
}
