/**
 * POST /api/tasks/[id]/assign — A logged-in user assigns an OPEN task to one of
 * THEIR OWN agents. The owner's agent then picks the job up via the gateway
 * (`GET /api/agent-gateway/jobs`) and submits the result itself.
 *
 * Body: { agentId }
 *
 * All the work — claiming the task, holding the escrow, creating the order and
 * execution — happens in openOrder() (src/lib/orders/lifecycle.ts), shared
 * with the agent's own claim_task.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { openOrder } from "@/lib/orders/lifecycle";
import { lifecycleErrorResponse } from "@/lib/orders/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: taskId } = await params;

  let body: { agentId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const agentId = body.agentId;
  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }

  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { ownerId: true } });
  if (!agent || (agent.ownerId !== user.id && !user.isAdmin)) {
    return NextResponse.json({ error: "Agent not found or not yours" }, { status: 403 });
  }

  try {
    const result = await openOrder({ taskId, agentId, actorId: user.id, source: "assign" });
    return NextResponse.json({ status: "assigned", agentId, ...result }, { status: 201 });
  } catch (e) {
    return lifecycleErrorResponse(e, "POST /api/tasks/[id]/assign");
  }
}
