/**
 * GET /api/dashboard — everything the dashboard home shows, from the database.
 *
 * The page used to render hardcoded numbers (12 active tasks, 48 agents,
 * $3,240 earned, four invented orders). They looked plausible, which made them
 * worse than obviously-fake: a new account saw someone else's imaginary
 * activity on its first screen.
 *
 * Figures are scoped to the signed-in user except where a marketplace-wide
 * number is the point (how many agents are available, what the platform is
 * doing right now).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { OPEN_ORDER_STATUSES, ORDER_GROUPS } from "@/lib/status";

/** Tasks that are live — published and not yet finished or withdrawn. */
const ACTIVE_TASK_STATUSES = ["OPEN", "MATCHED", "IN_PROGRESS"] as const;

const n = (v: unknown) => Number(v ?? 0);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  // An agent is "online" if it has checked in recently. isOnline alone goes
  // stale when a runner is killed without shutting down cleanly.
  const heartbeatCutoff = new Date(now.getTime() - 2 * 60 * 1000);

  const [
    activeTasks,
    newTasksThisWeek,
    availableAgents,
    newAgentsThisWeek,
    openAsPublisher,
    openAsAgentOwner,
    ordersInReview,
    myAgentsWorking,
    myAgentIds,
    recentOrders,
    completedToday,
    agentsOnline,
    recentExecutions,
    acceptedReviews,
    ratedReviews,
  ] = await Promise.all([
    prisma.task.count({
      where: { publisherId: user.id, status: { in: [...ACTIVE_TASK_STATUSES] } },
    }),
    prisma.task.count({
      where: { publisherId: user.id, createdAt: { gte: weekAgo } },
    }),
    prisma.agent.count({ where: { status: "ACTIVE" } }),
    prisma.agent.count({
      where: { status: "ACTIVE", createdAt: { gte: weekAgo } },
    }),
    // Both sides of the marketplace: orders I published, and orders my agents
    // are working on. An agent owner who dispatches work used to see 0 here.
    prisma.order.count({
      where: { publisherId: user.id, status: { in: OPEN_ORDER_STATUSES } },
    }),
    prisma.order.count({
      where: { agent: { ownerId: user.id }, status: { in: OPEN_ORDER_STATUSES } },
    }),
    prisma.order.count({
      where: { publisherId: user.id, status: "REVIEW" },
    }),
    prisma.order.count({
      where: { agent: { ownerId: user.id }, status: { in: [...ORDER_GROUPS.in_progress] } },
    }),
    prisma.agent.findMany({
      where: { ownerId: user.id },
      select: { id: true },
    }),
    prisma.order.findMany({
      where: { OR: [{ publisherId: user.id }, { agent: { ownerId: user.id } }] },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        status: true,
        price: true,
        createdAt: true,
        publisherId: true,
        task: { select: { title: true } },
        agent: { select: { name: true, ownerId: true } },
      },
    }),
    prisma.settlement.count({ where: { settledAt: { gte: startOfToday } } }),
    prisma.agent.count({
      where: { status: "ACTIVE", lastHeartbeat: { gte: heartbeatCutoff } },
    }),
    prisma.execution.findMany({
      where: {
        status: "COMPLETED",
        startedAt: { not: null },
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      take: 50,
      select: { startedAt: true, completedAt: true },
    }),
    prisma.review.count({ where: { userAccepted: true } }),
    prisma.review.count({ where: { userAccepted: { not: null } } }),
  ]);

  // Money in and out. Settlement rows are the one source for both, on every
  // page (dashboard, worker dashboard, wallet), so the figures always agree.
  const [earnedAgg, spentAgg] = await Promise.all([
    prisma.settlement.aggregate({
      _sum: { agentPayout: true },
      where: { status: "COMPLETED", order: { agent: { ownerId: user.id } } },
    }),
    prisma.settlement.aggregate({
      _sum: { totalAmount: true },
      where: { status: "COMPLETED", order: { publisherId: user.id } },
    }),
  ]);

  const avgMinutes =
    recentExecutions.length > 0
      ? recentExecutions.reduce(
          (sum, e) =>
            sum + (e.completedAt!.getTime() - e.startedAt!.getTime()) / 60000,
          0
        ) / recentExecutions.length
      : null;

  return NextResponse.json({
    stats: {
      activeTasks,
      newTasksThisWeek,
      availableAgents,
      newAgentsThisWeek,
      openOrders: openAsPublisher + openAsAgentOwner,
      openAsPublisher,
      openAsAgentOwner,
      ordersInReview,
      myAgentsWorking,
      // An account that owns no agent can never earn, so showing it "Total
      // Earned $0" forever is noise. Those users get what they have spent.
      ownsAgents: myAgentIds.length > 0,
      totalEarned: n(earnedAgg._sum.agentPayout),
      totalSpent: n(spentAgg._sum.totalAmount),
    },
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      task: o.task?.title ?? "Untitled task",
      agent: o.agent?.name ?? "Unassigned",
      status: o.status,
      amount: n(o.price),
      side: o.publisherId === user.id ? "publisher" : "agent-owner",
      createdAt: o.createdAt.toISOString(),
    })),
    platform: {
      completedToday,
      agentsOnline,
      avgMinutes,
      // Null until somebody has actually accepted or rejected something —
      // "100% satisfaction" off zero reviews is a lie the page used to tell.
      satisfactionRate:
        ratedReviews > 0 ? acceptedReviews / ratedReviews : null,
      reviewCount: ratedReviews,
    },
  });
}
