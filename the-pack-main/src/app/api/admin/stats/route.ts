/**
 * GET /api/admin/stats — platform analytics for admin panel
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const n = (v: unknown) => Number(v ?? 0);

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [
      totalUsers, totalAgents, totalTasks, totalOrders,
      ordersByStatus, recentOrders, topAgents, recentDisputes,
      financials,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.agent.count(),
      prisma.task.count(),
      prisma.order.count(),
      prisma.order.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.order.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: {
          task: { select: { title: true, type: true } },
          agent: { select: { name: true } },
          publisher: { select: { name: true } },
        },
      }),
      prisma.agent.findMany({
        take: 5,
        orderBy: { completedOrders: "desc" },
        select: { id: true, name: true, slug: true, completedOrders: true, avgRating: true, creditScore: true, creditTier: true },
      }),
      prisma.dispute.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { order: { include: { task: { select: { title: true } } } } },
      }),
      // Revenue
      prisma.settlement.aggregate({
        _sum: { totalAmount: true, platformFee: true, agentPayout: true },
        where: { status: "COMPLETED" },
      }),
    ]);

    const statusMap = Object.fromEntries(
      ordersByStatus.map((s) => [s.status, s._count.id])
    );

    return NextResponse.json({
      totals: {
        users: totalUsers,
        agents: totalAgents,
        tasks: totalTasks,
        orders: totalOrders,
        revenue: n(financials._sum.platformFee),
        volume: n(financials._sum.totalAmount),
        agentPayouts: n(financials._sum.agentPayout),
      },
      ordersByStatus: statusMap,
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        status: o.status,
        taskTitle: o.task?.title ?? "",
        taskType: o.task?.type ?? "",
        agentName: o.agent?.name ?? "",
        publisherName: o.publisher?.name ?? "",
        price: n(o.price),
        createdAt: o.createdAt,
      })),
      topAgents: topAgents.map((a) => ({
        id: a.id, name: a.name, slug: a.slug,
        completedOrders: n(a.completedOrders),
        avgRating: n(a.avgRating),
        creditScore: n(a.creditScore),
        creditTier: a.creditTier,
      })),
      disputes: recentDisputes.map((d) => ({
        id: d.id,
        orderId: d.orderId,
        status: d.status,
        reason: d.reason,
        taskTitle: d.order?.task?.title ?? "",
        createdAt: d.createdAt,
      })),
    });
  } catch (error) {
    console.error("[GET /api/admin/stats]", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
