/**
 * POST /api/admin/users/[id]/balance — admin money operations on one user.
 *
 *   { action: "adjust", amount: number, reason: string }
 *       credit (+) or debit (−) the available balance. This is also the
 *       top-up path until a payment provider is connected. A debit can never
 *       take the balance below zero (the ledger refuses).
 *   { action: "release_unbacked", reason: string }
 *       return frozen money that no active order accounts for.
 *
 * Every operation is a ledger entry plus an audit-log row naming the admin.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { adjustBalance, releaseUnbackedEscrow } from "@/lib/orders/lifecycle";
import { lifecycleErrorResponse } from "@/lib/orders/http";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("adjust"),
    amount: z.number().finite().refine((v) => v !== 0 && Math.abs(v) <= 1_000_000, "Amount must be non-zero and at most 1,000,000"),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({ action: z.literal("release_unbacked"), reason: z.string().trim().min(3).max(500) }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 422 });
  }
  if (!(await prisma.user.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    if (parsed.data.action === "adjust") {
      const amount = Math.round(parsed.data.amount * 100) / 100;
      await adjustBalance({ userId: id, amount, adminId: admin.id, reason: parsed.data.reason });
      return NextResponse.json({ ok: true, adjusted: amount });
    }
    const { amount } = await releaseUnbackedEscrow({ userId: id, adminId: admin.id, reason: parsed.data.reason });
    return NextResponse.json({ ok: true, released: amount });
  } catch (e) {
    return lifecycleErrorResponse(e, "POST /api/admin/users/[id]/balance");
  }
}
