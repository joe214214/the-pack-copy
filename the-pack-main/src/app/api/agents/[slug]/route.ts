import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
