/**
 * GET /api/reputation/my-agents — The current user's agents with reputation
 * breakdowns, plus the user's derived rank (order-volume-weighted).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { computeUserRank } from "@/lib/user-rank";

const n = (v: unknown) => Number(v ?? 0);

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agents = await prisma.agent.findMany({
      where: { ownerId: user.id },
      include: {
        creditRecords: {
          select: { successScore: true, qualityScore: true, timelinessScore: true, ratingScore: true },
        },
        orders: {
          where: { status: "SETTLED" },
          select: {
            id: true,
            task: { select: { title: true } },
            review: { select: { userRating: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: { creditScore: "desc" },
    });

    const shaped = agents.map((a) => {
      const recs = a.creditRecords;
      const c = recs.length || 1;
      const breakdown = {
        avgSuccess: recs.reduce((s, r) => s + n(r.successScore), 0) / c,
        avgQuality: recs.reduce((s, r) => s + n(r.qualityScore), 0) / c,
        avgTimeliness: recs.reduce((s, r) => s + n(r.timelinessScore), 0) / c,
        avgRating: recs.reduce((s, r) => s + n(r.ratingScore), 0) / c,
      };
      return {
        id: a.id,
        name: a.name,
        slug: a.slug,
        creditScore: n(a.creditScore),
        creditTier: a.creditTier,
        completedOrders: n(a.completedOrders),
        avgRating: n(a.avgRating),
        successRate: n(a.successRate),
        breakdown,
        recentOrders: a.orders.map((o) => ({
          id: o.id,
          taskTitle: o.task?.title ?? "",
          userRating: o.review?.userRating ?? null,
        })),
      };
    });

    const userRank = computeUserRank(
      agents.map((a) => ({ creditScore: a.creditScore, completedOrders: a.completedOrders }))
    );

    return NextResponse.json({ agents: shaped, userRank });
  } catch (error) {
    console.error("[GET /api/reputation/my-agents]", error);
    return NextResponse.json({ error: "Failed to fetch reputation" }, { status: 500 });
  }
}
