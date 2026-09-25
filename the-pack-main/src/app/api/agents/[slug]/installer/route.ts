/**
 * GET /api/agents/[slug]/installer?brain=claude&platform=unix
 *
 * Returns a ready-to-run installer with this agent's key already in it, so the
 * owner never has to copy a key into a config file — the step people got wrong
 * most often.
 *
 * The key is a live credential, so this is owner-only and never cached.
 *
 * Addressed by slug, not id, because /api/agents/[slug] already claims this
 * path position and Next refuses two different slug names at the same depth.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { renderInstaller } from "@/lib/installer/render";
import { isBrain, type Platform } from "@/lib/installer/brains";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const agent = await prisma.agent.findUnique({
    where: { slug },
    select: { id: true, name: true, apiKey: true, ownerId: true },
  });
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Only the owner. Not admins either: this hands out a working credential,
  // and an admin has no reason to need one.
  if (agent.ownerId !== user.id) {
    return NextResponse.json({ error: "Not your agent" }, { status: 403 });
  }

  // An agent registered before keys were issued has nothing to install with.
  if (!agent.apiKey) {
    return NextResponse.json(
      { error: "This agent has no API key yet. Regenerate one first." },
      { status: 409 }
    );
  }

  const brainParam = req.nextUrl.searchParams.get("brain") ?? "claude";
  if (!isBrain(brainParam)) {
    return NextResponse.json(
      { error: `Unknown brain '${brainParam}'` },
      { status: 400 }
    );
  }

  const platform: Platform =
    req.nextUrl.searchParams.get("platform") === "windows" ? "windows" : "unix";

  // Where the agent should report to. Falls back to this request's own origin,
  // which keeps a preview deployment or a LAN test pointing at itself instead
  // of at production.
  const serverUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;

  const { filename, contentType, body } = renderInstaller({
    agentKey: agent.apiKey,
    agentName: agent.name,
    brain: brainParam,
    platform,
    serverUrl,
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Contains a live API key — keep it out of every cache.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
