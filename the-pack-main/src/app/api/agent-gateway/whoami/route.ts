/**
 * GET /api/agent-gateway/whoami — The agent learns who it is: its own profile
 * and the user (owner) it belongs to. Lets an agent introduce itself / know who
 * it works for.
 */
import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";

const n = (v: unknown) => Number(v ?? 0);

export async function GET(request: Request) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;
  const { agent } = auth;

  const owner = await prisma.user.findUnique({
    where: { id: agent.ownerId },
    select: { id: true, name: true, email: true, roles: true },
  });

  return NextResponse.json({
    agent: {
      id: agent.id,
      name: agent.name,
      slug: agent.slug,
      status: agent.status,
      supportedTaskTypes: agent.supportedTaskTypes,
      creditScore: n(agent.creditScore),
      creditTier: agent.creditTier,
      completedOrders: agent.completedOrders,
      isOnline: agent.isOnline,
      // Owner-approved claude.ai connectors this agent may use (MCP server names).
      // The runner reads this to decide which connectors to unlock for the worker.
      allowedConnectors: agent.allowedConnectors ?? [],
    },
    owner: owner
      ? { id: owner.id, name: owner.name, email: owner.email, roles: owner.roles }
      : null,
  });
}
