/**
 * GET /api/wallet/[userId]  — full wallet data: balance + transaction history
 * GET /api/wallet/me        — current user's wallet
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const n = (v: unknown) => Number(v ?? 0);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // "me" → the logged-in user. Otherwise only self or admin may view.
    const resolvedId = userId === "me" ? sessionUser.id : userId;
    if (resolvedId !== sessionUser.id && !sessionUser.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: resolvedId },
      select: { id: true, balance: true, frozenBalance: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch all financial transactions from orders
    const [publishedOrders, agentOrders] = await Promise.all([
      // Orders where user is publisher (spending)
      prisma.order.findMany({
        where: { publisherId: resolvedId, status: { in: ["SETTLED", "CANCELLED", "CREATED", "EXECUTING", "REVIEW"] } },
        include: {
          task: { select: { title: true, type: true } },
          agent: { select: { name: true } },
          settlement: { select: { totalAmount: true, platformFee: true, agentPayout: true, settledAt: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      // Orders where agent belongs to user (earnings)
      prisma.order.findMany({
        where: {
          agent: { ownerId: resolvedId },
          status: { in: ["SETTLED"] },
        },
        include: {
          task: { select: { title: true, type: true } },
          agent: { select: { name: true } },
          settlement: { select: { agentPayout: true, settledAt: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    // Build unified transaction list
    type Tx = {
      id: string;
      type: "escrow" | "charge" | "refund" | "earning" | "deposit";
      amount: number;
      description: string;
      taskTitle: string;
      agentName: string;
      date: string;
      status: string;
    };

    const transactions: Tx[] = [];

    for (const order of publishedOrders) {
      const price = n(order.price);
      if (order.status === "SETTLED") {
        transactions.push({
          id: `charge-${order.id}`,
          type: "charge",
          amount: -price,
          description: `Payment for task`,
          taskTitle: order.task?.title ?? "Unknown Task",
          agentName: order.agent?.name ?? "Unknown Agent",
          date: order.settlement?.settledAt?.toISOString() ?? order.createdAt.toISOString(),
          status: "completed",
        });
      } else if (order.status === "CANCELLED") {
        transactions.push({
          id: `refund-${order.id}`,
          type: "refund",
          amount: price,
          description: `Refund for cancelled order`,
          taskTitle: order.task?.title ?? "Unknown Task",
          agentName: order.agent?.name ?? "Unknown Agent",
          date: order.updatedAt?.toISOString() ?? order.createdAt.toISOString(),
          status: "completed",
        });
      } else {
        // Active orders
        transactions.push({
          id: `escrow-${order.id}`,
          type: "escrow",
          amount: -price,
          description: `Funds in escrow`,
          taskTitle: order.task?.title ?? "Unknown Task",
          agentName: order.agent?.name ?? "Unknown Agent",
          date: order.createdAt.toISOString(),
          status: order.status.toLowerCase(),
        });
      }
    }

    for (const order of agentOrders) {
      const payout = n(order.settlement?.agentPayout);
      transactions.push({
        id: `earn-${order.id}`,
        type: "earning",
        amount: payout,
        description: `Agent payout`,
        taskTitle: order.task?.title ?? "Unknown Task",
        agentName: order.agent?.name ?? "Unknown Agent",
        date: order.settlement?.settledAt?.toISOString() ?? order.createdAt.toISOString(),
        status: "completed",
      });
    }

    // Sort by date desc
    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Compute stats
    const totalSpent = publishedOrders
      .filter((o) => o.status === "SETTLED")
      .reduce((sum, o) => sum + n(o.price), 0);
    const totalEarned = agentOrders.reduce((sum, o) => sum + n(o.settlement?.agentPayout), 0);

    return NextResponse.json({
      balance: n(user.balance),
      frozenBalance: n(user.frozenBalance),
      totalBalance: n(user.balance) + n(user.frozenBalance),
      totalSpent,
      totalEarned,
      transactions,
    });
  } catch (error) {
    console.error("[GET /api/wallet/[userId]]", error);
    return NextResponse.json({ error: "Failed to fetch wallet" }, { status: 500 });
  }
}
