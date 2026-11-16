/**
 * GET /api/admin/disputes?status=open|resolved — disputed orders for admin review.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const resolved = new URL(request.url).searchParams.get("status") === "resolved";

  const disputes = await prisma.dispute.findMany({
    where: resolved ? { status: "RESOLVED" } : { status: { not: "RESOLVED" } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      raisedBy: { select: { id: true, name: true, email: true } },
      order: {
        select: {
          id: true,
          status: true,
          price: true,
          escrowAmount: true,
          currentRound: true,
          deliveredAt: true,
          task: { select: { id: true, title: true, type: true } },
          agent: { select: { id: true, name: true, slug: true, owner: { select: { id: true, name: true, email: true } } } },
          publisher: { select: { id: true, name: true, email: true } },
          review: { select: { autoScore: true, autoPassed: true, userComment: true } },
        },
      },
    },
  });
  return NextResponse.json({ disputes });
}
