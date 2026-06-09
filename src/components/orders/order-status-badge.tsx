"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type OrderStatusId =
  | "CREATED"
  | "EXECUTING"
  | "REVIEW"
  | "ACCEPTED"
  | "DISPUTED"
  | "SETTLED"
  | "CANCELLED";

const STATUS_META: Record<OrderStatusId, {
  label: string;
  color: string;
  bg: string;
  border: string;
  dot: string;
}> = {
  CREATED:   { label: "Awaiting Execution", color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30",    dot: "bg-blue-400"    },
  EXECUTING: { label: "Executing",          color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/30",  dot: "bg-violet-400"  },
  REVIEW:    { label: "In Review",          color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   dot: "bg-amber-400"   },
  ACCEPTED:  { label: "Accepted",           color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", dot: "bg-emerald-400" },
  DISPUTED:  { label: "Disputed",           color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/30",    dot: "bg-rose-400"    },
  SETTLED:   { label: "Settled",            color: "text-slate-400",   bg: "bg-slate-500/10",   border: "border-slate-500/30",   dot: "bg-slate-400"   },
  CANCELLED: { label: "Cancelled",          color: "text-slate-500",   bg: "bg-slate-500/8",    border: "border-slate-500/20",   dot: "bg-slate-500"   },
};

interface OrderStatusBadgeProps {
  status: string;
  showDot?: boolean;
  className?: string;
}

export function OrderStatusBadge({ status, showDot = true, className }: OrderStatusBadgeProps) {
  const meta = STATUS_META[status as OrderStatusId] ?? {
    label: status,
    color: "text-muted-foreground",
    bg: "bg-muted",
    border: "border-border",
    dot: "bg-muted-foreground",
  };

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 text-xs font-medium", meta.color, meta.bg, meta.border, className)}
    >
      {showDot && (
        <span className={cn("inline-block h-1.5 w-1.5 rounded-full", meta.dot)} />
      )}
      {meta.label}
    </Badge>
  );
}

export function getOrderStatusMeta(status: string) {
  return STATUS_META[status as OrderStatusId];
}
