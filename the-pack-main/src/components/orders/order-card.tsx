"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { getTaskType } from "@/lib/task-types";
import { CreditTierBadge } from "@/components/agents/credit-tier-badge";
import { Bot, Clock, DollarSign, ArrowRight, User } from "lucide-react";

interface OrderCardProps {
  order: {
    id: string;
    status: string;
    price: number | string;
    platformFee: number | string;
    createdAt: string | Date;
    deadline: string | Date;
    task: { id: string; title: string; type: string } | null;
    agent: { id: string; name: string; slug: string; creditTier: string } | null;
    publisher: { id: string; name: string } | null;
    settlement?: { agentPayout: number | string } | null;
  };
  viewAs?: "publisher" | "agent-owner";
  className?: string;
}

export function OrderCard({ order, viewAs = "publisher", className }: OrderCardProps) {
  const price = Number(order.price ?? 0);
  const fee = Number(order.platformFee ?? 0);
  const payout = Number(order.settlement?.agentPayout ?? 0);
  const taskMeta = getTaskType(order.task?.type ?? "");
  const deadline = new Date(order.deadline);
  const isOverdue = deadline < new Date() && !["ACCEPTED", "SETTLED", "CANCELLED"].includes(order.status);
  const timeLeft = getTimeLeft(deadline);

  return (
    <Link href={`/dashboard/orders/${order.id}`}>
      <div
        className={cn(
          // Container query, not a viewport breakpoint: this card is used both
          // full-width and at ~1/3 width inside the orders grid. `sm:flex-row`
          // keyed off the viewport, so in the grid it still laid out
          // horizontally at 360px wide and crushed the title. `@container` +
          // `@md:` makes the card respond to its OWN width instead.
          "@container group flex flex-col @md:flex-row @md:items-center gap-4 rounded-xl border bg-card/50 p-4",
          "transition-all duration-200 cursor-pointer",
          "hover:bg-card hover:shadow-md hover:shadow-primary/5 hover:border-primary/20 hover:-translate-y-0.5",
          className
        )}
      >
        {/* Task type icon */}
        <div className={cn("shrink-0 rounded-lg p-3", taskMeta?.bgColor ?? "bg-muted")}>
          {taskMeta ? (
            <taskMeta.icon className={cn("h-5 w-5", taskMeta.color)} />
          ) : (
            <Bot className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* The title wraps to two lines rather than truncating on one. In the
              card grid these sit at ~1/3 width, where a single truncated line
              cut most titles down to "Wander …" and made separate orders
              indistinguishable. The badge keeps its own width. */}
          <div className="flex items-start gap-2">
            <h3 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors line-clamp-2 flex-1 min-w-0">
              {order.task?.title ?? "Untitled task"}
            </h3>
            <div className="shrink-0">
              <OrderStatusBadge status={order.status} />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Bot className="h-3 w-3" />
              {order.agent?.name ?? "Unassigned"}
              {order.agent?.creditTier && (
                <CreditTierBadge tier={order.agent.creditTier} showEmoji className="ml-1 py-0 px-1 h-4" />
              )}
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {order.publisher?.name ?? "Unknown"}
            </span>
            {viewAs === "agent-owner" && payout > 0 ? (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <DollarSign className="h-3 w-3" />
                Earn ${payout.toFixed(2)}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-foreground/70">
                <DollarSign className="h-3 w-3" />
                ${price.toFixed(2)}
                <span className="text-muted-foreground">(−${fee.toFixed(2)} fee)</span>
              </span>
            )}
          </div>
        </div>

        {/* Deadline + arrow */}
        <div className="flex items-center gap-3 shrink-0">
          <div className={cn("flex items-center gap-1 text-xs", isOverdue ? "text-rose-400" : "text-muted-foreground")}>
            <Clock className="h-3.5 w-3.5" />
            <span>{isOverdue ? "Overdue" : timeLeft}</span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
        </div>
      </div>
    </Link>
  );
}

function getTimeLeft(deadline: Date): string {
  const diff = deadline.getTime() - Date.now();
  if (diff <= 0) return "Overdue";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h left`;
  const days = Math.floor(hrs / 24);
  return `${days}d left`;
}
