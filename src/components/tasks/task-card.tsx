"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { getTaskType } from "@/lib/task-types";
import { Clock, DollarSign, FileText, ArrowRight } from "lucide-react";

interface TaskCardProps {
  task: {
    id: string;
    title: string;
    type: string;
    description: string;
    budget: number;
    deadlineHours: number;
    status: string;
    createdAt: string | Date;
    publisher?: { name: string } | null;
  };
  className?: string;
}

const statusStyles: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "text-slate-400 bg-slate-500/10 border-slate-500/30" },
  OPEN: { label: "Open", className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  MATCHED: { label: "Matched", className: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  EXECUTING: { label: "Executing", className: "text-violet-400 bg-violet-500/10 border-violet-500/30" },
  REVIEW: { label: "In Review", className: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  ACCEPTED: { label: "Accepted", className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  DISPUTED: { label: "Disputed", className: "text-rose-400 bg-rose-500/10 border-rose-500/30" },
  SETTLED: { label: "Settled", className: "text-slate-400 bg-slate-500/10 border-slate-500/30" },
  CANCELLED: { label: "Cancelled", className: "text-slate-500 bg-slate-500/10 border-slate-500/30" },
};

export function TaskCard({ task, className }: TaskCardProps) {
  const meta = getTaskType(task.type);
  const status = statusStyles[task.status] ?? { label: task.status, className: "" };
  const timeAgo = getTimeAgo(new Date(task.createdAt));
  const budget = Number(task.budget ?? 0);
  const deadlineHours = Number(task.deadlineHours ?? 0);

  return (
    <Link href={`/dashboard/tasks/${task.id}`}>
      <div
        className={cn(
          "group relative flex flex-col gap-3 rounded-xl border bg-card/50 p-4",
          "transition-all duration-200",
          "hover:bg-card hover:shadow-md hover:shadow-primary/5 hover:border-primary/20 hover:-translate-y-0.5",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {meta && (
              <div className={cn("rounded-lg p-2 shrink-0 mt-0.5", meta.bgColor)}>
                <meta.icon className={cn("h-4 w-4", meta.color)} />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors truncate">
                {task.title}
              </h3>
              {meta && (
                <p className={cn("text-xs mt-0.5", meta.color)}>{meta.label}</p>
              )}
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn("text-xs shrink-0", status.className)}
          >
            {status.label}
          </Badge>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {task.description}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-border/40">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <DollarSign className="h-3 w-3 text-emerald-500" />
              ${budget.toFixed(0)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-blue-400" />
              {deadlineHours}h
            </span>
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {task.publisher?.name ?? "Anonymous"}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
            <span>{timeAgo}</span>
            <ArrowRight className="h-3 w-3" />
          </div>
        </div>
      </div>
    </Link>
  );
}

function getTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
