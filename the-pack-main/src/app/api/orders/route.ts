/**
 * GET  /api/orders          — List orders (scope: mine-publisher | mine-agent | all)
 * POST /api/orders          — Create a new order (place bid on a task)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { freezeBalance, calculateFees, InsufficientBalanceError } from "@/lib/balance";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") ?? "publisher";
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
    const offset = parseInt(searchParams.get("offset") ?? "0");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    // Admins may view everything with ?scope=all
    if (scope === "all" && user.isAdmin) {
      // no user filter
    } else if (scope === "agent" || scope === "agent-owner") {
      where.agent = { ownerId: user.id };
    } else {
      // default: as publisher
      where.publisherId = user.id;
    }
    if (status) where.status = status;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          task: { select: { id: true, title: true, type: true } },
          agent: { select: { id: true, name: true, slug: true, creditTier: true } },
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
    ]);

    return NextResponse.json({ orders, total, limit, offset });
  } catch (error) {
    console.error("[GET /api/orders]", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

const createOrderSchema = z.object({
  taskId: z.string(),
  agentId: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { taskId, agentId } = createOrderSchema.parse(body);

    // 1. Validate task is OPEN and not already ordered
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { order: true, publisher: true },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    if (task.publisherId !== user.id && !user.isAdmin) {
      return NextResponse.json({ error: "You can only hire for your own tasks" }, { status: 403 });
    }
    if (task.status !== "OPEN") {
      return NextResponse.json({ error: `Task is ${task.status}, not OPEN` }, { status: 409 });
    }
    if (task.order) {
      return NextResponse.json({ error: "Task already has an order" }, { status: 409 });
    }

    // 2. Validate agent is ACTIVE
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: { owner: true },
    });

    if (!agent || agent.status !== "ACTIVE") {
      return NextResponse.json({ error: "Agent not available" }, { status: 404 });
    }

    // 3. Calculate fees
    const price = Number(task.budget);
    const { platformFee, escrowAmount } = calculateFees(price);

    // 4. Publisher ID — use task's publisher for now
    const publisherId = task.publisherId;

    // 5. Freeze publisher balance (escrow)
    try {
      await freezeBalance(publisherId, escrowAmount);
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return NextResponse.json({ error: err.message }, { status: 402 });
      }
      throw err;
    }

    // 6. Create order + update task status atomically
    const deadline = new Date(Date.now() + task.deadlineHours * 60 * 60 * 1000);

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          taskId,
          agentId,
          publisherId,
          price,
          platformFee,
          escrowAmount,
          paymentMethod: "BALANCE",
          status: "CREATED",
          deadline,
        },
        include: {
          task: { select: { id: true, title: true, type: true } },
          agent: { select: { id: true, name: true, slug: true } },
          publisher: { select: { id: true, name: true } },
        },
      });

      // Update task and agent stats
      await tx.task.update({
        where: { id: taskId },
        data: { status: "MATCHED" },
      });

      await tx.agent.update({
        where: { id: agentId },
        data: { totalOrders: { increment: 1 } },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          actorId: publisherId,
          action: "order.create",
          entityType: "order",
          entityId: newOrder.id,
          details: { taskId, agentId, price, platformFee },
        },
      });

      return newOrder;
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 422 });
    }
    console.error("[POST /api/orders]", error);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
