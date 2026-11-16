/**
 * GET /api/admin/users?q=  — users with balances, for the admin money desk.
 * Each row includes `unbackedEscrow`: frozen money no active order accounts for.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ESCROW_HOLDING } from "@/lib/orders/lifecycle";

export async function GET(request: Request) {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const q = new URL(request.url).searchParams.get("q")?.trim();

  const users = await prisma.user.findMany({
    where: q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {},
    select: { id: true, email: true, name: true, roles: true, balance: true, frozenBalance: true, createdAt: true, isBanned: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const held = await prisma.order.groupBy({
    by: ["publisherId"],
    where: { status: { in: ESCROW_HOLDING }, publisherId: { in: users.map((u) => u.id) } },
    _sum: { escrowAmount: true },
  });
  const heldBy = new Map(held.map((h) => [h.publisherId, Number(h._sum.escrowAmount ?? 0)]));

  return NextResponse.json({
    users: users.map((u) => {
      const frozen = Number(u.frozenBalance);
      const inOrders = heldBy.get(u.id) ?? 0;
      return {
        ...u,
        balance: Number(u.balance),
        frozenBalance: frozen,
        escrowInOrders: inOrders,
        unbackedEscrow: Math.max(0, Math.round((frozen - inOrders) * 100) / 100),
      };
    }),
  });
}
