/**
 * GET /api/users/balance?userId=xxx  — Fetch user balance
 */
import { NextRequest, NextResponse } from "next/server";
import { getBalance } from "@/lib/balance";

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId");

    if (!userId) {
      // TODO: get from session — return default publisher balance for now
      const { prisma } = await import("@/lib/prisma");
      const user = await prisma.user.findFirst({
        where: { email: "alex@example.com" },
        select: { id: true },
      });
      if (!user) return NextResponse.json({ error: "No user" }, { status: 404 });
      const balance = await getBalance(user.id);
      return NextResponse.json(balance);
    }

    const balance = await getBalance(userId);
    return NextResponse.json(balance);
  } catch (error) {
    console.error("[GET /api/users/balance]", error);
    return NextResponse.json({ error: "Failed to fetch balance" }, { status: 500 });
  }
}
