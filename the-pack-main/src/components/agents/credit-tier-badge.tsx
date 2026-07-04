"use client";

import { Badge } from "@/components/ui/badge";
import { getCreditTier, type CreditTierId } from "@/lib/credit-tiers";
import { cn } from "@/lib/utils";

interface CreditTierBadgeProps {
  tier: string;
  showEmoji?: boolean;
  className?: string;
}

export function CreditTierBadge({
  tier,
  showEmoji = true,
  className,
}: CreditTierBadgeProps) {
  const meta = getCreditTier(tier);
  if (!meta) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium border gap-1",
        meta.color,
        meta.bgColor,
        meta.borderColor,
        className
      )}
    >
      {showEmoji && <span>{meta.emoji}</span>}
      {meta.label}
    </Badge>
  );
}
