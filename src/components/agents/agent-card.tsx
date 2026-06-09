"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditTierBadge } from "@/components/agents/credit-tier-badge";
import { getTaskType } from "@/lib/task-types";
import { Star, Zap, CheckCircle2, Clock, Wifi, WifiOff } from "lucide-react";

// Prisma v7 w/ pg adapter may return Decimal fields as strings → coerce to number
const n = (v: unknown): number => Number(v ?? 0);

interface AgentCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agent: Record<string, any>;
  className?: string;
  highlighted?: boolean;
}

export function AgentCard({ agent, className, highlighted }: AgentCardProps) {
  const avgMins = Math.round(n(agent.avgDurationSecs) / 60);
  const avgRating = n(agent.avgRating);
  const successRate = n(agent.successRate);
  const basePrice = n(agent.basePrice);
  const completedOrders = n(agent.completedOrders);

  return (
    <Link href={`/dashboard/agents/${agent.slug}`}>
      <Card
        className={cn(
          "group relative overflow-hidden cursor-pointer h-full",
          "transition-all duration-200",
          "hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5",
          "hover:border-primary/30",
          highlighted && "border-primary/40 shadow-md shadow-primary/10",
          className
        )}
      >
        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {/* Online status indicator */}
                <span
                  className={cn(
                    "relative flex h-2.5 w-2.5 shrink-0 rounded-full",
                    agent.isOnline ? "bg-emerald-500" : "bg-muted-foreground/40"
                  )}
                  title={agent.isOnline ? "Online" : "Offline"}
                >
                  {agent.isOnline && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  )}
                </span>
                <h3 className="font-semibold text-base leading-tight truncate group-hover:text-primary transition-colors">
                  {agent.name}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {agent.modelInfo}
              </p>
            </div>
            <CreditTierBadge tier={agent.creditTier} />
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mt-2">
            {agent.description}
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Task types */}
          <div className="flex flex-wrap gap-1.5">
            {(agent.supportedTaskTypes as string[]).slice(0, 3).map((typeId) => {
              const meta = getTaskType(typeId);
              if (!meta) return null;
              return (
                <Badge
                  key={typeId}
                  variant="secondary"
                  className={cn("text-xs gap-1", meta.color, meta.bgColor)}
                >
                  <meta.icon className="h-3 w-3" />
                  {meta.label}
                </Badge>
              );
            })}
            {(agent.supportedTaskTypes as string[]).length > 3 && (
              <Badge variant="secondary" className="text-xs text-muted-foreground">
                +{(agent.supportedTaskTypes as string[]).length - 3}
              </Badge>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="space-y-0.5">
              <div className="flex items-center justify-center gap-1 text-amber-400">
                <Star className="h-3.5 w-3.5 fill-amber-400" />
                <span className="text-sm font-semibold">{avgRating.toFixed(1)}</span>
              </div>
              <p className="text-xs text-muted-foreground">Rating</p>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-center gap-1 text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="text-sm font-semibold">
                  {Math.round(successRate * 100)}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Success</p>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-center gap-1 text-blue-400">
                <Clock className="h-3.5 w-3.5" />
                <span className="text-sm font-semibold">{avgMins > 0 ? `${avgMins}m` : "<1m"}</span>
              </div>
              <p className="text-xs text-muted-foreground">Avg time</p>
            </div>
          </div>

          {/* Price + orders */}
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            <div className="flex items-center gap-1 text-primary">
              <Zap className="h-3.5 w-3.5" />
              <span className="text-sm font-semibold">
                From ${basePrice.toFixed(0)}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {completedOrders.toLocaleString()} orders
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
