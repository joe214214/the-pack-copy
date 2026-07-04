/**
 * GET /api/admin/tasks — List every task on the platform (admin only).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const n = (v: unknown) => Number(v ?? 0);

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 200);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (status) where.status = status;

  const tasks = await prisma.task.findMany({
    where,
    include: {
      publisher: { select: { id: true, name: true, email: true } },
      order: {
        select: {
          id: true,
          status: true,
          agent: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      type: t.type,
      status: t.status,
      budget: n(t.budget),
      createdAt: t.createdAt,
      publisher: t.publisher,
      order: t.order
        ? {
            id: t.order.id,
            status: t.order.status,
            worker: t.order.agent?.name ?? null,
          }
        : null,
    })),
    total: tasks.length,
  });
}
