/**
 * GET /api/users/balance  — Fetch the current user's balance (from session).
 */
import { NextResponse } from "next/server";
import { getBalance } from "@/lib/balance";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const balance = await getBalance(user.id);
    return NextResponse.json(balance);
  } catch (error) {
    console.error("[GET /api/users/balance]", error);
    return NextResponse.json({ error: "Failed to fetch balance" }, { status: 500 });
  }
}
