import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// GET /api/agents/[slug] — supports both slug and id lookup
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const byId = request.nextUrl.searchParams.get("byId");

    const agent = byId
      ? await import("@/lib/prisma").then(({ prisma }) =>
          prisma.agent.findUnique({
            where: { id: slug },
            include: {
              owner: { select: { id: true, name: true } },
              orders: {
                where: { status: { in: ["SETTLED", "ACCEPTED"] } },
                include: {
                  review: { select: { userRating: true, userComment: true, autoPassed: true, autoScore: true } },
                  task: { select: { type: true, title: true } },
                },
                orderBy: { createdAt: "desc" },
                take: 5,
              },
            },
          })
        )
      : await import("@/lib/prisma").then(({ prisma }) =>
          prisma.agent.findUnique({
            where: { slug },
            include: {
              owner: { select: { id: true, name: true } },
              orders: {
                where: { status: { in: ["SETTLED", "ACCEPTED"] } },
                include: {
                  review: { select: { userRating: true, userComment: true, autoPassed: true, autoScore: true } },
                  task: { select: { type: true, title: true } },
                },
                orderBy: { createdAt: "desc" },
                take: 5,
              },
            },
          })
        );

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({ agent });
  } catch (error) {
    console.error("[GET /api/agents/[slug]]", error);
    return NextResponse.json({ error: "Failed to fetch agent" }, { status: 500 });
  }
}

// PATCH /api/agents/[slug] — the OWNER (or an admin) updates settings on their
// own agent. Currently: allowedConnectors (which claude.ai connectors the agent
// may use). Accepts slug or, with ?byId=1, an id.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug } = await params;
    const byId = request.nextUrl.searchParams.get("byId");
    const agent = await prisma.agent.findUnique({
      where: byId ? { id: slug } : { slug },
      select: { id: true, ownerId: true },
    });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    if (agent.ownerId !== user.id && !user.isAdmin) {
      return NextResponse.json({ error: "Not your agent" }, { status: 403 });
    }

    let body: { allowedConnectors?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const data: { allowedConnectors?: string[] } = {};
    if (body.allowedConnectors !== undefined) {
      if (
        !Array.isArray(body.allowedConnectors) ||
        !body.allowedConnectors.every((c) => typeof c === "string")
      ) {
        return NextResponse.json(
          { error: "allowedConnectors must be an array of strings" },
          { status: 400 }
        );
      }
      // MCP server names only: letters, digits, underscore, hyphen. Dedupe.
      const cleaned = Array.from(
        new Set(
          body.allowedConnectors
            .map((c) => c.trim())
            .filter((c) => /^[A-Za-z0-9_-]+$/.test(c))
        )
      ).slice(0, 20);
      data.allowedConnectors = cleaned;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await prisma.agent.update({
      where: { id: agent.id },
      data,
      select: { id: true, allowedConnectors: true },
    });

    return NextResponse.json({ agent: updated });
  } catch (error) {
    console.error("[PATCH /api/agents/[slug]]", error);
    return NextResponse.json({ error: "Failed to update agent" }, { status: 500 });
  }
}
