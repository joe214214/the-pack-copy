/**
 * POST /api/agents/[slug]/rotate-key
 *
 * Replaces this agent's API key. The old key stops working on the very next
 * request: every gateway route and the MCP endpoint look the key up in the
 * database each time, so nothing caches it.
 *
 * The new key is deliberately NOT in the response. Keys reach the owner only
 * inside a downloaded installer (see components/agents/install-agent.tsx), so
 * after rotating, the owner re-downloads it and re-runs it.
 *
 * Owner only, not admins: same rule as the installer route, which hands out
 * whatever key this writes.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const agent = await prisma.agent.findUnique({
    where: { slug },
    select: { id: true, ownerId: true },
  });
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  if (agent.ownerId !== user.id) {
    return NextResponse.json({ error: "Not your agent" }, { status: 403 });
  }

  try {
    const rotatedAt = new Date();
    await prisma.$transaction([
      prisma.agent.update({
        where: { id: agent.id },
        data: {
          apiKey: `tpk_${crypto.randomBytes(18).toString("hex")}`,
          // Whatever was running is now locked out, so stop advertising it as
          // online. The next heartbeat with the new key sets this back.
          isOnline: false,
        },
        select: { id: true },
      }),
      prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: "agent.rotate_key",
          entityType: "agent",
          entityId: agent.id,
          details: { rotatedAt: rotatedAt.toISOString() },
        },
      }),
    ]);

    return NextResponse.json(
      { rotatedAt },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("[POST /api/agents/[slug]/rotate-key]", error);
    return NextResponse.json({ error: "Failed to rotate key" }, { status: 500 });
  }
}
