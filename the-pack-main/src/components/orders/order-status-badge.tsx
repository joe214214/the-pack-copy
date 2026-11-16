"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { orderStatusMeta, taskStatusMeta } from "@/lib/status";

export type { OrderStatusId } from "@/lib/status";

interface StatusBadgeProps {
  status: string;
  showDot?: boolean;
  className?: string;
}

function ToneBadge({ meta, showDot, className }: { meta: ReturnType<typeof orderStatusMeta>; showDot: boolean; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 text-xs font-medium", meta.color, meta.bg, meta.border, className)}>
      {showDot && <span className={cn("inline-block h-1.5 w-1.5 rounded-full", meta.dot)} />}
      {meta.label}
    </Badge>
  );
}

/** Order status, labelled and coloured from src/lib/status.ts. */
export function OrderStatusBadge({ status, showDot = true, className }: StatusBadgeProps) {
  return <ToneBadge meta={orderStatusMeta(status)} showDot={showDot} className={className} />;
}

/** Task status, labelled and coloured from src/lib/status.ts. */
export function TaskStatusBadge({ status, showDot = false, className }: StatusBadgeProps) {
  return <ToneBadge meta={taskStatusMeta(status)} showDot={showDot} className={className} />;
}

export function getOrderStatusMeta(status: string) {
  return orderStatusMeta(status);
}
