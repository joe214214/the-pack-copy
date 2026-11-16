"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import {
  DeliverableFiles,
  type DeliverableFile,
} from "@/components/orders/deliverable-files";
import { CreditTierBadge } from "@/components/agents/credit-tier-badge";
import { getTaskType } from "@/lib/task-types";
import {
  ArrowLeft, Bot, CheckCircle2, Clock, FileText,
  Loader2, ShoppingCart, Star, AlertTriangle, Zap,
  CheckCheck, XCircle, Timer, Play, Trophy, Wifi, RotateCcw, Plus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const n = (v: unknown) => Number(v ?? 0);

// ─── Timeline ─────────────────────────────────────────────────────────────────

interface TimelineEvent {
  icon: React.ReactNode;
  label: string;
  time: string | null;
  done: boolean;
  active?: boolean;
  /** Colours a terminal step: red for a dispute, grey for cancelled/refunded. */
  tone?: "danger" | "muted";
}

const TONE_DOT: Record<NonNullable<TimelineEvent["tone"]>, string> = {
  danger: "border-rose-500 bg-rose-500/15 text-rose-400",
  muted: "border-slate-500 bg-slate-500/15 text-slate-400",
};
const TONE_TEXT: Record<NonNullable<TimelineEvent["tone"]>, string> = {
  danger: "text-rose-400",
  muted: "text-slate-300",
};

function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="space-y-0">
      {events.map((e, i) => (
        <div key={i} className="flex gap-3">
          {/* connector */}
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm",
                e.tone
                  ? TONE_DOT[e.tone]
                  : e.done
                  ? "border-primary bg-primary text-primary-foreground"
                  : e.active
                  ? "border-primary text-primary animate-pulse"
                  : "border-muted-foreground/20 text-muted-foreground/40"
              )}
            >
              {e.icon}
            </div>
            {i < events.length - 1 && (
              <div
                className={cn(
                  "w-px flex-1 my-1",
                  e.done ? "bg-primary/40" : "bg-muted-foreground/10"
                )}
              />
            )}
          </div>
          {/* content */}
          <div className="pb-5 pt-1 min-w-0">
            <p
              className={cn(
                "text-sm font-medium",
                e.tone ? TONE_TEXT[e.tone] : e.done ? "text-foreground" : e.active ? "text-primary" : "text-muted-foreground/50"
              )}
            >
              {e.label}
            </p>
            {e.time && (
              <p className="text-xs text-muted-foreground mt-0.5">{e.time}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrderDetail = any;

/** Who is looking at the order and what they may do (from GET /api/orders/[id]). */
interface OrderViewer {
  isPublisher: boolean;
  isAgentOwner: boolean;
  isAdmin: boolean;
  can: { cancel: boolean; review: boolean };
}

/** Orders auto-accept this long after delivery if the publisher does not respond. */
const AUTO_ACCEPT_MS = 7 * 24 * 60 * 60 * 1000;

const ACTION_SUCCESS: Record<string, string> = {
  cancel: "Order cancelled. The full amount has been refunded to you.",
  accept: "Delivery accepted. The agent has been paid.",
  dispute: "Dispute opened. An admin will review it.",
};

/**
 * One row of revision history. `previousFiles` is the snapshot of what that
 * round delivered, taken when the publisher asked for changes — each new round
 * overwrites execution.outputFiles, so this is the only copy left.
 */
interface RevisionEntry {
  id: string;
  round: number;
  feedback: string;
  previousScore?: number | null;
  previousFiles?: DeliverableFile[] | null;
  createdAt: string;
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [viewer, setViewer] = useState<OrderViewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const fetchOrder = async () => {
    try {
      const res = await fetch(`/api/orders/${id}`);
      const data = await res.json();
      setOrder(res.ok ? data.order : null);
      setViewer(res.ok ? data.viewer ?? null : null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Live-refresh while the agent is working so the publisher sees progress update
  useEffect(() => {
    if (order?.status !== "EXECUTING" && order?.status !== "REVISION_REQUESTED") return;
    const t = setInterval(fetchOrder, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.status]);

  const handleAction = async (action: "cancel" | "accept" | "dispute") => {
    if (action === "cancel" && !confirm("Cancel this order? The full amount is refunded to you.")) return;
    setActing(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(ACTION_SUCCESS[action]);
      await fetchOrder();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading order...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p>Order not found.</p>
        <Button render={<Link href="/dashboard/orders" />} variant="ghost" className="mt-4">
          Back to Orders
        </Button>
      </div>
    );
  }

  const price = n(order.price);
  const fee = n(order.platformFee);
  const agentPayout = n(order.settlement?.agentPayout);
  const taskMeta = getTaskType(order.task?.type ?? "");
  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;

  // Build timeline. Driven by what actually happened (timestamps, revisions)
  // rather than an index into a linear status list, so revision loops,
  // disputes, cancellations and refunds all render sensibly.
  const status: string = order.status;
  const revisions: RevisionEntry[] = order.revisions ?? [];
  const isClosed = status === "CANCELLED" || status === "REFUNDED";
  const started =
    !!order.execution?.startedAt || !["CREATED", "FUNDED", "CANCELLED", "REFUNDED"].includes(status);
  const delivered =
    !!order.deliveredAt ||
    revisions.length > 0 ||
    ["REVIEW", "REVISION_REQUESTED", "ACCEPTED", "DISPUTED", "SETTLED"].includes(status);
  const completed = status === "SETTLED" || status === "ACCEPTED";
  const deliveredAt: string | null = order.deliveredAt ?? order.execution?.completedAt ?? null;
  const autoAcceptAt = order.deliveredAt
    ? new Date(new Date(order.deliveredAt).getTime() + AUTO_ACCEPT_MS)
    : null;

  let timeline: TimelineEvent[] = [
    {
      icon: <ShoppingCart className="h-3.5 w-3.5" />,
      label: "Order placed",
      time: fmt(order.createdAt),
      done: true,
    },
    {
      icon: <Play className="h-3.5 w-3.5" />,
      label: "Started",
      time: fmt(order.execution?.startedAt ?? null),
      done: started,
      active: status === "EXECUTING" && order.currentRound <= 1,
    },
    {
      icon: <Timer className="h-3.5 w-3.5" />,
      label: status === "REVIEW" ? "Delivered — awaiting review" : "Delivered",
      time: fmt(deliveredAt),
      done: delivered,
      active: status === "REVIEW",
    },
  ];
  if (status === "REVISION_REQUESTED" || (status === "EXECUTING" && order.currentRound > 1)) {
    timeline.push({
      icon: <RotateCcw className="h-3.5 w-3.5" />,
      label: `Revising (round ${order.currentRound})`,
      time: fmt(revisions[revisions.length - 1]?.createdAt ?? order.updatedAt),
      done: false,
      active: true,
    });
  }

  if (status === "DISPUTED") {
    timeline.push({
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      label: "Disputed — an admin will decide",
      time: fmt(
        ((order.disputes ?? []) as { createdAt: string }[])
          .map((d) => d.createdAt)
          .sort()
          .at(-1) ?? order.updatedAt
      ),
      done: true,
      tone: "danger",
    });
  } else if (isClosed) {
    // Only show what happened before it stopped, then the terminal step.
    timeline = timeline.filter((e) => e.done);
    timeline.push({
      icon: <XCircle className="h-3.5 w-3.5" />,
      label: status === "REFUNDED" ? "Refunded" : "Cancelled",
      time: fmt(order.updatedAt),
      done: true,
      tone: "muted",
    });
  } else {
    timeline.push({
      icon: <Trophy className="h-3.5 w-3.5" />,
      label: "Completed",
      time: fmt(order.settlement?.settledAt ?? (completed ? order.updatedAt : null)),
      done: completed,
    });
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <Button render={<Link href="/dashboard/orders" />} variant="ghost" size="sm">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Orders
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <OrderStatusBadge status={order.status} />
            {taskMeta && (
              <span className={cn("text-xs font-medium", taskMeta.color)}>
                {taskMeta.label}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold">{order.task?.title ?? "Untitled"}</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-muted-foreground">
              Order ID: <span className="font-mono">{order.id}</span>
            </p>
            {order.currentRound > 1 && (
              <Badge variant="outline" className="text-xs text-orange-400 bg-orange-500/10 border-orange-500/30">
                Round {order.currentRound} / {(order.task?.maxRevisions ?? 3) + (order.extraRevisions ?? 0) + 1}
              </Badge>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2 flex-wrap justify-end">
            {status === "EXECUTING" && (
              <div className="flex items-center gap-2 text-sm text-violet-400 animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin" />
                {order.currentRound > 1 ? `Agent is revising (round ${order.currentRound})…` : "Agent is working…"}
              </div>
            )}
            {status === "REVISION_REQUESTED" && (
              <div className="flex items-center gap-2 text-sm text-orange-400 animate-pulse">
                <RotateCcw className="h-4 w-4" />
                Revision requested — waiting for the agent (round {order.currentRound})
              </div>
            )}
            {viewer?.can.review && (
              <Button
                size="sm"
                render={<Link href={`/dashboard/orders/${id}/review`} />}
                className="glow-sm"
              >
                <CheckCheck className="h-4 w-4 mr-1" />
                Review Delivery
              </Button>
            )}
            {viewer?.can.cancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAction("cancel")}
                disabled={acting}
                className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
              >
                {acting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                Cancel order
              </Button>
            )}
          </div>
          {status === "REVIEW" && !viewer?.can.review && viewer?.isAgentOwner && (
            <p className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              Waiting for the publisher&apos;s review
              {autoAcceptAt && <> — auto-accepts on {autoAcceptAt.toLocaleDateString(undefined, { dateStyle: "medium" })}</>}
            </p>
          )}
        </div>
      </div>

      {/* Main 2-col layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left — timeline + execution */}
        <div className="lg:col-span-2 space-y-5">

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Order Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline events={timeline} />
            </CardContent>
          </Card>

          {/* Work plan + live progress (set by the agent) */}
          {order.execution?.taskPlan && order.execution.taskPlan.length > 0 && (() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const plan = order.execution.taskPlan as any[];
            const done = plan.filter((s) => s.status === "done").length;
            const pct = Math.round((done / plan.length) * 100);
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <CheckCheck className="h-4 w-4 text-primary" />
                      Work Plan & Progress
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {done}/{plan.length} done
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="space-y-2">
                    {plan.map((step) => (
                      <div key={step.id} className="flex items-center gap-2.5 text-sm">
                        {step.status === "done" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        ) : step.status === "in_progress" ? (
                          <Loader2 className="h-4 w-4 text-amber-400 shrink-0 animate-spin" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/30 shrink-0 ml-0.5" />
                        )}
                        <span className={cn(step.status === "done" ? "text-foreground" : "text-muted-foreground")}>
                          {step.title}
                        </span>
                      </div>
                    ))}
                  </div>
                  {order.status === "EXECUTING" && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-dot" />
                      Updating live as the agent works…
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Remote execution alert — heartbeat stale */}
          {order.execution?.heartbeatStatus === "STALE" && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-300">
                  Agent may be disconnected
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  The remote agent has not sent a heartbeat recently. It may have gone offline or encountered an error.
                  If this persists, the order will be automatically cancelled and your funds will be refunded.
                </p>
              </div>
            </div>
          )}

          {/* Remote execution info badge */}
          {order.execution?.executionSource && order.execution.executionSource !== "LOCAL" && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
                <Wifi className="h-3 w-3" />
                Remote execution via {order.execution.executionSource}
              </Badge>
              {order.execution?.heartbeatStatus && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    order.execution.heartbeatStatus === "ALIVE"
                      ? "border-emerald-500/50 text-emerald-400"
                      : order.execution.heartbeatStatus === "STALE"
                      ? "border-amber-500/50 text-amber-400"
                      : "border-rose-500/50 text-rose-400"
                  )}
                >
                  Heartbeat: {order.execution.heartbeatStatus}
                </Badge>
              )}
            </div>
          )}

          {/* Execution logs */}
          {order.execution?.logs && order.execution.logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Play className="h-4 w-4 text-violet-400" />
                  Execution Logs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg bg-black/40 border border-border/30 p-3 space-y-1 font-mono text-xs max-h-48 overflow-y-auto">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {order.execution.logs.map((log: any, i: number) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-muted-foreground shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={cn(
                        log.level === "error" ? "text-rose-400" :
                        log.level === "warn" ? "text-amber-400" :
                        "text-emerald-400/80"
                      )}>
                        [{log.level.toUpperCase()}]
                      </span>
                      <span className="text-foreground/80">{log.message}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Output files */}
          {order.execution?.outputFiles && order.execution.outputFiles.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-blue-400" />
                  Delivered Files
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Inline deliverables are stored as data: URLs, which a browser
                    will not open as a top-level navigation. Route them through
                    the server so "open" really opens the page in its own tab
                    (served under a sandbox CSP). */}
                <DeliverableFiles
                  files={order.execution.outputFiles as DeliverableFile[]}
                  openUrlFor={(file) =>
                    order.execution?.id && file.name
                      ? `/api/deliverables/${order.execution.id}/${encodeURIComponent(file.name)}`
                      : undefined
                  }
                />
              </CardContent>
            </Card>
          )}

          {/* Review */}
          {order.review && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Star className="h-4 w-4 text-amber-400" />
                  Review
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-4 text-sm">
                  <div className={cn(
                    "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
                    order.review.autoPassed ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"
                  )}>
                    {order.review.autoPassed ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    Auto-check {order.review.autoPassed ? "passed" : "failed"}
                  </div>
                  {order.review.userRating && (
                    <div className="flex items-center gap-1 text-amber-400">
                      {[1,2,3,4,5].map(s => (
                        <Star key={s} className={cn("h-3.5 w-3.5", s <= order.review.userRating ? "fill-amber-400" : "text-muted-foreground/30")} />
                      ))}
                    </div>
                  )}
                </div>
                {order.review.userComment && (
                  <p className="text-sm text-foreground/80 italic border-l-2 border-primary/30 pl-3">
                    &ldquo;{order.review.userComment}&rdquo;
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right — payment + agent info. Sticky because the left column runs
            long on a delivered order (plan, progress log, file grid, preview),
            and payment state is what the publisher keeps checking against. */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {/* Payment */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">
                Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Task price</span>
                <span className="font-medium">${price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Platform fee</span>
                <span>−${fee.toFixed(2)}</span>
              </div>
              {agentPayout > 0 && (
                <div className="flex justify-between border-t border-border/50 pt-2 text-emerald-400 font-medium">
                  <span>Agent received</span>
                  <span>${agentPayout.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border/50 pt-2">
                <span className="text-muted-foreground">Method</span>
                <span className="text-xs font-mono bg-muted/40 px-2 py-0.5 rounded">
                  {order.paymentMethod}
                </span>
              </div>
              {order.settlement?.status && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Settlement</span>
                  <span className={cn(
                    "text-xs font-medium",
                    order.settlement.status === "COMPLETED" ? "text-emerald-400" : "text-amber-400"
                  )}>
                    {order.settlement.status}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Deadline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">
                Deadline
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-400" />
                <span className="font-medium">{fmt(order.deadline)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Agent */}
          {order.agent && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">
                  Agent
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{order.agent.name}</p>
                    <CreditTierBadge tier={order.agent.creditTier} className="mt-0.5" />
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href={`/dashboard/agents/${order.agent.slug}`} />}
                  className="w-full"
                >
                  <Zap className="h-3.5 w-3.5 mr-2" />
                  View Agent Profile
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Revision History */}
          {order.revisions && order.revisions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">
                  Revision History
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(order.revisions as RevisionEntry[])
                  .slice()
                  .sort((a, b) => b.round - a.round)
                  .map((rev) => (
                    <div
                      key={rev.id}
                      className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-orange-400">
                          Round {rev.round} → {rev.round + 1}
                        </span>
                        {rev.previousScore != null && (
                          <span className="text-xs text-muted-foreground">
                            Score: {(rev.previousScore * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-300">{rev.feedback}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(rev.createdAt).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>

                      {/* What that round actually delivered. Each new round
                          overwrites execution.outputFiles, so without this
                          snapshot the earlier version is gone from the page and
                          there is nothing to compare the rewrite against.
                          Served by id through /api/revisions/... because every
                          round tends to deliver the same filename. */}
                      {Array.isArray(rev.previousFiles) &&
                        rev.previousFiles.length > 0 && (
                          <div className="space-y-2 pt-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              Delivered in round {rev.round}
                            </p>
                            <DeliverableFiles
                              compact
                              files={rev.previousFiles as DeliverableFile[]}
                              openUrlFor={(file) =>
                                file.name
                                  ? `/api/revisions/${rev.id}/${encodeURIComponent(file.name)}`
                                  : undefined
                              }
                            />
                          </div>
                        )}
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

          {/* Buy Extra Rounds */}
          {viewer?.isPublisher && status === "REVIEW" &&
            order.currentRound > (order.task?.maxRevisions ?? 3) + (order.extraRevisions ?? 0) && (
              <Card className="border-orange-500/30">
                <CardContent className="pt-4 space-y-2">
                  <p className="text-sm text-orange-400 font-medium">
                    No revisions remaining
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Purchase extra rounds at 10% of task budget per round.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                    onClick={async () => {
                      setActing(true);
                      try {
                        const res = await fetch(`/api/orders/${order.id}/add-revisions`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ rounds: 1 }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error);
                        toast.success(`Added 1 revision round ($${data.costCharged.toFixed(2)} charged)`);
                        await fetchOrder();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Failed to add revisions");
                      } finally {
                        setActing(false);
                      }
                    }}
                    disabled={acting}
                  >
                    <Plus className="h-3.5 w-3.5 mr-2" />
                    Buy 1 Extra Revision · ${((n(order.task?.budget) * 0.10)).toFixed(2)}
                  </Button>
                </CardContent>
              </Card>
            )}

        </div>
      </div>
    </div>
  );
}
