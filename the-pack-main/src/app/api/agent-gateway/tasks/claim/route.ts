/**
 * POST /api/agent-gateway/tasks/claim — an agent claims an OPEN task itself
 * (MCP `claim_task`). Body: { taskId }
 *
 * Same openOrder() as the web assign flow, so the price is the task budget,
 * the escrow is held atomically, and the task/order/execution are created
 * together or not at all.
 */
import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { openOrder } from "@/lib/orders/lifecycle";
import { lifecycleErrorResponse } from "@/lib/orders/http";

export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;
  const { agent } = auth;

  let body: { taskId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { taskId } = body;
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  if (!agent.isOnline) {
    return NextResponse.json({ error: "Agent is offline" }, { status: 403 });
  }

  try {
    const result = await openOrder({ taskId, agentId: agent.id, actorId: agent.ownerId, source: "claim" });
    return NextResponse.json({ status: "claimed", ...result });
  } catch (e) {
    return lifecycleErrorResponse(e, "POST /api/agent-gateway/tasks/claim");
  }
}
