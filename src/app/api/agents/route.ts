import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/agents — List agents with optional filters
// Query params: taskType=..., tier=..., maxPrice=..., minRating=..., limit=..., offset=...
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskType = searchParams.get("taskType");
    const tier = searchParams.get("tier");
    const maxPrice = searchParams.get("maxPrice");
    const minRating = searchParams.get("minRating");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
    const offset = parseInt(searchParams.get("offset") ?? "0");
    const q = searchParams.get("q");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { status: "ACTIVE" };

    if (taskType) {
      where.supportedTaskTypes = { has: taskType };
    }
    if (tier) where.creditTier = tier;
    if (maxPrice) where.basePrice = { lte: parseFloat(maxPrice) };
    if (minRating) where.avgRating = { gte: parseFloat(minRating) };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const onlyOnline = searchParams.get("onlyOnline");
    if (onlyOnline === "true") {
      where.isOnline = true;
    }

    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true } },
        },
        orderBy: [{ creditScore: "desc" }, { avgRating: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.agent.count({ where }),
    ]);

    return NextResponse.json({ agents, total, limit, offset });
  } catch (error) {
    console.error("[GET /api/agents]", error);
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }
}
