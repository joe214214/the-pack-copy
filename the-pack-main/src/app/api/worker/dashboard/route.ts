/**
 * GET /api/worker/dashboard
 * 
 * Returns all data needed for the Worker Dashboard:
 * - User's agents (with online status, heartbeat, daily quota)
 * - Available tasks matching agent capabilities
 * - Active orders (currently executing)
 * - Earnings summary
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import type { TaskType } from "@/generated/prisma/enums";

const n = (v: unknown) => Number(v ?? 0);

export async function GET() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = sessionUser.id;

  try {
    // 1. Get user's agents
    const agents = await prisma.agent.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true,
        slug: true,
        apiKey: true,
        status: true,
        isOnline: true,
        lastHeartbeat: true,
        heartbeatInterval: true,
        dailyCompleted: true,
        dailyLimit: true,
        creditScore: true,
        creditTier: true,
        avgRating: true,
        successRate: true,
        completedOrders: true,
        supportedTaskTypes: true,
        acceptTaskTypes: true,
        basePrice: true,
      },
    });

    // 2. Collect all supported task types across user's agents
    const allTaskTypes = new Set<TaskType>();
    for (const agent of agents) {
      for (const t of agent.acceptTaskTypes) {
        allTaskTypes.add(t);
      }
    }

    // 3. Get available (OPEN) tasks matching agent capabilities
    const availableTasks = allTaskTypes.size > 0
      ? await prisma.task.findMany({
          where: {
            status: "OPEN",
            type: { in: Array.from(allTaskTypes) },
          },
          select: {
            id: true,
            type: true,
            title: true,
            description: true,
            budget: true,
            deadlineHours: true,
            createdAt: true,
            publisher: {
              select: { name: true, email: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : [];

    // 4. Get active orders for user's agents (EXECUTING or REVIEW)
    const agentIds = agents.map((a) => a.id);
    const activeOrders = agentIds.length > 0
      ? await prisma.order.findMany({
          where: {
            agentId: { in: agentIds },
            status: { in: ["EXECUTING", "REVIEW"] },
          },
          include: {
            task: { select: { title: true, type: true, description: true } },
            agent: { select: { name: true, slug: true } },
            execution: {
              select: {
                status: true,
                heartbeatStatus: true,
                startedAt: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

    // 5. Earnings summary
    const settlements = agentIds.length > 0
      ? await prisma.settlement.findMany({
          where: {
            order: { agentId: { in: agentIds } },
            status: "COMPLETED",
          },
          select: {
            agentPayout: true,
            settledAt: true,
          },
        })
      : [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    let earningsToday = 0;
    let earningsWeek = 0;
    let earningsTotal = 0;

    for (const s of settlements) {
      const amount = n(s.agentPayout);
      earningsTotal += amount;
      if (s.settledAt && s.settledAt >= todayStart) earningsToday += amount;
      if (s.settledAt && s.settledAt >= weekStart) earningsWeek += amount;
    }

    return NextResponse.json({
      agents: agents.map((a) => ({
        ...a,
        basePrice: n(a.basePrice),
        creditScore: n(a.creditScore),
        avgRating: n(a.avgRating),
        successRate: n(a.successRate),
      })),
      availableTasks: availableTasks.map((t) => ({
        ...t,
        budget: n(t.budget),
      })),
      activeOrders: activeOrders.map((o) => ({
        ...o,
        price: n(o.price),
        deadline: o.deadline,
      })),
      earnings: {
        today: earningsToday,
        week: earningsWeek,
        total: earningsTotal,
      },
    });
  } catch (error) {
    console.error("[GET /api/worker/dashboard]", error);
    return NextResponse.json({ error: "Failed to fetch worker data" }, { status: 500 });
  }
}
