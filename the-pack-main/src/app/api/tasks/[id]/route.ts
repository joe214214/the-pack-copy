import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// GET /api/tasks/[id] — Single task with publisher info (marketplace-public)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        publisher: {
          select: { id: true, name: true },
        },
        order: {
          select: {
            id: true,
            status: true,
            agent: {
              select: { id: true, name: true, slug: true, avgRating: true, creditTier: true, ownerId: true },
            },
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error("[GET /api/tasks/[id]]", error);
    return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 });
  }
}

/**
 * PATCH /api/tasks/[id] — { action: "cancel" }
 *
 * The publisher can withdraw a task nobody has taken yet. Every other status
 * change happens through the order lifecycle (src/lib/orders/lifecycle.ts);
 * this route used to set any status from the request body, unauthenticated.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const { action } = (await request.json().catch(() => ({}))) as { action?: string };
  if (action !== "cancel") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const task = await prisma.task.findUnique({ where: { id }, select: { publisherId: true } });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (task.publisherId !== user.id && !user.isAdmin) {
    return NextResponse.json({ error: "Only the publisher can cancel this task" }, { status: 403 });
  }

  // Compare-and-set: only an untaken task can be withdrawn. One that has an
  // order is cancelled through the order (PATCH /api/orders/[id]), which refunds.
  const r = await prisma.task.updateMany({
    where: { id, status: { in: ["DRAFT", "OPEN"] }, order: null },
    data: { status: "CANCELLED" },
  });
  if (r.count !== 1) {
    return NextResponse.json({ error: "Only a task nobody has taken yet can be withdrawn" }, { status: 409 });
  }
  return NextResponse.json({ task: { id, status: "CANCELLED" } });
}
