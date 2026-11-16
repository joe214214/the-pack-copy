/**
 * Order timers, run by the worker (`npm run worker`) and by the cron route
 * (GET /api/cron/maintenance):
 *   - an order past its deadline without a delivery is cancelled and refunded
 *     (EXECUTING and REVISION_REQUESTED — revisions have deadlines too);
 *   - a delivery left in REVIEW for AUTO_ACCEPT_DAYS (default 7) is accepted
 *     and paid out.
 * The work itself is runOrderMaintenance() in the order lifecycle module.
 */
import { runOrderMaintenance } from "@/lib/orders/lifecycle";

export async function checkTimeouts() {
  const r = await runOrderMaintenance();
  if (r.timedOut || r.autoAccepted || r.errors.length) {
    console.log(`[OrderTimers] timed out ${r.timedOut}, auto-accepted ${r.autoAccepted}`);
    for (const e of r.errors) console.error(`[OrderTimers] ${e}`);
  }
  return r;
}
