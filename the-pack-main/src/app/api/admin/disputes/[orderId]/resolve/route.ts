/**
 * POST /api/admin/disputes/[orderId]/resolve
 *   { outcome: "pay" | "refund" | "split", agentShare?: 0..1 (split only), note: string }
 *
 * pay    — the agent owner is paid the escrow (minus the platform fee)
 * refund — the publisher gets the escrow back
 * split  — agentShare of the escrow is paid out, the rest refunded
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { resolveDispute } from "@/lib/orders/lifecycle";
import { lifecycleErrorResponse } from "@/lib/orders/http";

const schema = z.object({
  outcome: z.enum(["pay", "refund", "split"]),
  agentShare: z.number().min(0.01).max(0.99).optional(),
  note: z.string().trim().min(3).max(1000),
}).refine((v) => v.outcome !== "split" || v.agentShare !== undefined, { message: "agentShare is required for a split", path: ["agentShare"] });

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { orderId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 422 });
  }
  try {
    const result = await resolveDispute({ orderId, adminId: admin.id, ...parsed.data });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return lifecycleErrorResponse(e, "POST /api/admin/disputes/[orderId]/resolve");
  }
}
