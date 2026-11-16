/**
 * GET /api/cron/maintenance — scheduled housekeeping for serverless deploys,
 * where `npm run worker` does not run:
 *   - agents whose heartbeat lapsed are marked offline;
 *   - undelivered orders past their deadline are cancelled and refunded;
 *   - deliveries left in REVIEW for AUTO_ACCEPT_DAYS are accepted and paid.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET`. Vercel Cron sends exactly this
 * header when CRON_SECRET is set in the project's env (see vercel.json).
 * Without CRON_SECRET configured the route refuses to run at all.
 * Safe to call repeatedly: every transition is compare-and-set.
 */
import { NextResponse } from "next/server";
import { checkHeartbeats } from "@/lib/heartbeat-monitor";
import { runOrderMaintenance } from "@/lib/orders/lifecycle";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await checkHeartbeats();
  const orders = await runOrderMaintenance();
  return NextResponse.json({ ok: true, ...orders });
}
