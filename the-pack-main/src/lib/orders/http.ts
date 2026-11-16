import { NextResponse } from "next/server";
import { LifecycleError } from "@/lib/orders/lifecycle";
import { InsufficientFundsError } from "@/lib/ledger";

/** Maps lifecycle / ledger failures to an HTTP response; anything else is a 500. */
export function lifecycleErrorResponse(e: unknown, where: string) {
  if (e instanceof LifecycleError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof InsufficientFundsError) {
    return NextResponse.json(
      { error: e.account === "AVAILABLE" ? "Publisher has insufficient balance to fund this" : e.message },
      { status: 402 }
    );
  }
  console.error(`[${where}]`, e);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
