/**
 * GET /api/orders — List orders the current user is part of.
 *
 *   ?scope=  mine (default) — orders I published OR my agents are working on
 *            publisher      — only orders I published
 *            agent-owner    — only orders my agents are working on ("agent" also accepted)
 *            all            — every order (admin only)
 *   ?status= a group from src/lib/status.ts (in_progress, awaiting_review,
 *            disputed, completed, closed), a status, or a comma list of either
 *   ?limit=, ?offset=
 *
 * Each order carries `side`: "publisher" | "agent-owner" | "both" from the
 * caller's point of view. `counts` gives the number in every group for the
 * same scope, so filter tabs can show totals that always add up.
 *
 * POST used to create a legacy CREATED order that no agent ever picked up.
 * Work now starts with POST /api/tasks/[id]/assign or the agent's claim_task.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";
import { ORDER_GROUPS, parseOrderStatusFilter, type OrderGroup } from "@/lib/status";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") ?? "mine";
    const statuses = parseOrderStatusFilter(searchParams.get("status"));
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20") || 20, 1), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0") || 0, 0);

    let scopeWhere: Prisma.OrderWhereInput;
    if (scope === "all" && user.isAdmin) scopeWhere = {};
    else if (scope === "publisher") scopeWhere = { publisherId: user.id };
    else if (scope === "agent" || scope === "agent-owner") scopeWhere = { agent: { ownerId: user.id } };
    else scopeWhere = { OR: [{ publisherId: user.id }, { agent: { ownerId: user.id } }] };

    const where: Prisma.OrderWhereInput = statuses ? { AND: [scopeWhere, { status: { in: statuses } }] } : scopeWhere;

    const [orders, total, byStatus] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          task: { select: { id: true, title: true, type: true, status: true } },
          agent: { select: { id: true, name: true, slug: true, creditTier: true, ownerId: true } },
          publisher: { select: { id: true, name: true } },
          execution: { select: { status: true, startedAt: true, completedAt: true } },
          review: { select: { userRating: true, autoPassed: true, userAccepted: true } },
          settlement: { select: { status: true, settledAt: true, agentPayout: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.order.count({ where }),
      prisma.order.groupBy({ by: ["status"], where: scopeWhere, _count: { _all: true } }),
    ]);

    const counts = Object.fromEntries(
      (Object.keys(ORDER_GROUPS) as OrderGroup[]).map((g) => [
        g,
        byStatus
          .filter((b) => (ORDER_GROUPS[g] as readonly string[]).includes(b.status))
          .reduce((s, b) => s + b._count._all, 0),
      ])
    ) as Record<OrderGroup, number>;
    const all = byStatus.reduce((s, b) => s + b._count._all, 0);

    return NextResponse.json({
      orders: orders.map((o) => {
        const pub = o.publisherId === user.id;
        const own = o.agent.ownerId === user.id;
        return { ...o, side: pub && own ? "both" : pub ? "publisher" : own ? "agent-owner" : "admin" };
      }),
      total,
      counts: { all, ...counts },
      limit,
      offset,
    });
  } catch (error) {
    console.error("[GET /api/orders]", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "Gone: orders are created when an agent takes a task (POST /api/tasks/[id]/assign or the agent's claim_task)." },
    { status: 410 }
  );
}
