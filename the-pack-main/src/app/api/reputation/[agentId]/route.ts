/**
 * GET /api/reputation/[agentId]
 * Returns full credit history and reputation data for an agent.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const n = (v: unknown) => Number(v ?? 0);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;

    // Resolve "me-all" to return all agents belonging to the first user
    if (agentId === "my-agents") {
      const user = await prisma.user.findFirst({ orderBy: { balance: "desc" } });
      if (!user) return NextResponse.json({ agents: [] });
      const agents = await prisma.agent.findMany({
        where: { ownerId: user.id },
        include: {
          creditRecords: { orderBy: { createdAt: "desc" }, take: 20 },
          orders: {
            where: { status: { in: ["SETTLED", "ACCEPTED"] } },
            include: { review: true, task: { select: { title: true, type: true } } },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      });
      return NextResponse.json({ agents: agents.map(formatAgent) });
    }

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        creditRecords: { orderBy: { createdAt: "desc" }, take: 30 },
        orders: {
          where: { status: { in: ["SETTLED", "ACCEPTED"] } },
          include: { review: true, task: { select: { title: true, type: true } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    return NextResponse.json({ agent: formatAgent(agent) });
  } catch (error) {
    console.error("[GET /api/reputation]", error);
    return NextResponse.json({ error: "Failed to fetch reputation" }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatAgent(agent: any) {
  const records = agent.creditRecords ?? [];
  const n_local = (v: unknown) => Number(v ?? 0);

  const avgSuccess = records.length ? records.reduce((s: number, r: any) => s + n_local(r.successScore), 0) / records.length : 0;
  const avgQuality = records.length ? records.reduce((s: number, r: any) => s + n_local(r.qualityScore), 0) / records.length : 0;
  const avgTimeliness = records.length ? records.reduce((s: number, r: any) => s + n_local(r.timelinessScore), 0) / records.length : 0;
  const avgRating = records.length ? records.reduce((s: number, r: any) => s + n_local(r.ratingScore), 0) / records.length : 0;

  return {
    id: agent.id,
    name: agent.name,
    slug: agent.slug,
    creditScore: n(agent.creditScore),
    creditTier: agent.creditTier,
    avgRating: n(agent.avgRating),
    successRate: n(agent.successRate),
    completedOrders: n(agent.completedOrders),
    totalOrders: n(agent.totalOrders),
    breakdown: { avgSuccess, avgQuality, avgTimeliness, avgRating },
    creditRecords: records.slice(0, 10).map((r: any) => ({
      id: r.id,
      successScore: n_local(r.successScore),
      timelinessScore: n_local(r.timelinessScore),
      qualityScore: n_local(r.qualityScore),
      ratingScore: n_local(r.ratingScore),
      createdAt: r.createdAt,
    })),
    recentOrders: (agent.orders ?? []).map((o: any) => ({
      id: o.id,
      taskTitle: o.task?.title ?? "Unknown",
      taskType: o.task?.type ?? "",
      userRating: o.review?.userRating,
      autoPassed: o.review?.autoPassed,
      autoScore: n_local(o.review?.autoScore),
      createdAt: o.createdAt,
    })),
  };
}
