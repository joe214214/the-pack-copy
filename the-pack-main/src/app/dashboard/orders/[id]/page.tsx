"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { CreditTierBadge } from "@/components/agents/credit-tier-badge";
import { getTaskType } from "@/lib/task-types";
import {
  ArrowLeft, Bot, CheckCircle2, Clock, DollarSign, FileText,
  Loader2, ShoppingCart, Star, AlertTriangle, Zap,
  CheckCheck, XCircle, Timer, Play, Trophy, Wifi, ImageIcon, Download, ExternalLink, RotateCcw, ChevronDown, ChevronUp, Plus,
} from "lucide-react";

// File types the browser can render in a tab, so we offer an "Open / preview"
// link (not just download) — e.g. an agent-delivered self-contained web page.
const PREVIEWABLE = /\.(html?|svg|pdf|txt|md|json|csv)$/i;
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
}

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
                e.done
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
                e.done ? "text-foreground" : e.active ? "text-primary" : "text-muted-foreground/50"
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

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const fetchOrder = async () => {
    try {
      const res = await fetch(`/api/orders/${id}`);
      const data = await res.json();
      setOrder(data.order);
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

  const handleAction = async (action: string) => {
    setActing(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Order ${action}ed successfully`);
      await fetchOrder();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActing(false);
    }
  };

  const handleTriggerExecution = async () => {
    setActing(true);
    try {
      const res = await fetch(`/api/executions/${id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Execution started! Agent is working...");
      // Refresh every 3s to show progress
      setTimeout(fetchOrder, 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start execution");
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

  // Build timeline
  const statusOrder = ["CREATED", "EXECUTING", "REVIEW", "ACCEPTED", "SETTLED"];
  const currentIdx = statusOrder.indexOf(order.status);

  const timeline: TimelineEvent[] = [
    {
      icon: <ShoppingCart className="h-3.5 w-3.5" />,
      label: "Order Placed",
      time: fmt(order.createdAt),
      done: true,
    },
    {
      icon: <Play className="h-3.5 w-3.5" />,
      label: "Execution Started",
      time: fmt(order.execution?.startedAt ?? null),
      done: currentIdx >= 1,
      active: order.status === "EXECUTING",
    },
    {
      icon: <Timer className="h-3.5 w-3.5" />,
      label: "In Review",
      time: fmt(order.execution?.completedAt ?? null),
      done: currentIdx >= 2,
      active: order.status === "REVIEW",
    },
    {
      icon: <CheckCheck className="h-3.5 w-3.5" />,
      label: "Accepted",
      time: order.status === "ACCEPTED" || order.status === "SETTLED" ? fmt(order.updatedAt) : null,
      done: currentIdx >= 3,
    },
    {
      icon: <Trophy className="h-3.5 w-3.5" />,
      label: "Settled",
      time: fmt(order.settlement?.settledAt ?? null),
      done: order.status === "SETTLED",
    },
  ];

  // Override for cancelled/disputed
  if (order.status === "CANCELLED") {
    timeline.push({
      icon: <XCircle className="h-3.5 w-3.5" />,
      label: "Order Cancelled",
      time: fmt(order.updatedAt),
      done: true,
    });
  }
  if (order.status === "DISPUTED") {
    timeline.push({
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      label: "Dispute Raised",
      time: fmt(order.updatedAt),
      done: true,
    });
  }
  if (order.status === "REVISION_REQUESTED") {
    timeline.push({
      icon: <RotateCcw className="h-3.5 w-3.5" />,
      label: `Revision Requested (Round ${order.currentRound})`,
      time: fmt(order.updatedAt),
      done: true,
      active: true,
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
        <div className="flex gap-2 flex-wrap">
          {order.status === "CREATED" && !order.execution && (
            <>
              <Button
                size="sm"
                onClick={handleTriggerExecution}
                disabled={acting}
                className="glow-sm"
              >
                {acting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                Start Execution
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAction("cancel")}
                disabled={acting}
                className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
              >
                <XCircle className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </>
          )}
          {order.status === "EXECUTING" && (
            <div className="flex items-center gap-2 text-sm text-violet-400 animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin" />
              Agent is executing...
            </div>
          )}
          {order.status === "REVIEW" && (
            <Button
              size="sm"
              render={<Link href={`/dashboard/orders/${id}/review`} />}
              className="glow-sm"
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Review Delivery
            </Button>
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
              <CardContent className="space-y-3">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(() => {
                  const files = order.execution.outputFiles as any[];
                  const imageFiles = files.filter((f: any) =>
                    f.type?.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(f.name)
                  );
                  const otherFiles = files.filter((f: any) =>
                    !f.type?.startsWith("image/") && !/\.(png|jpe?g|webp|gif)$/i.test(f.name)
                  );
                  return (
                    <>
                      {/* Image grid */}
                      {imageFiles.length > 0 && (
                        <div className="grid grid-cols-2 gap-2">
                          {imageFiles.map((file: any, i: number) => (
                            <a
                              key={i}
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group relative aspect-video overflow-hidden rounded-lg border bg-muted hover:border-primary/50 transition-colors"
                            >
                              <img
                                src={file.url}
                                alt={file.name}
                                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              />
                              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <p className="text-xs text-white truncate">{file.name}</p>
                                <p className="text-xs text-white/70">{(file.size / 1024).toFixed(1)} KB</p>
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                      {/* Other files list */}
                      {otherFiles.map((file: any, i: number) => {
                        const isHtml =
                          file.type === "text/html" || /\.html?$/i.test(file.name || "");
                        const previewable =
                          isHtml ||
                          file.type?.startsWith("text/") ||
                          file.type === "application/pdf" ||
                          PREVIEWABLE.test(file.name || "");
                        // Inline deliverables are stored as data: URLs, which a
                        // browser will not open as a top-level navigation. Route
                        // them through the server so "open" really opens the page
                        // in its own tab (served under a sandbox CSP).
                        const openUrl =
                          order.execution?.id && file.name
                            ? `/api/deliverables/${order.execution.id}/${encodeURIComponent(file.name)}`
                            : file.url;
                        return (
                          <div key={i} className="space-y-2">
                            <div className="flex items-center gap-3 rounded-lg border p-3">
                              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium flex-1 truncate">{file.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {(file.size / 1024).toFixed(1)} KB
                              </span>
                              {isHtml && (
                                <a
                                  href={openUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open this page in a new tab"
                                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Open
                                </a>
                              )}
                              {previewable && !isHtml && (
                                <a
                                  href={openUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open in a new tab"
                                >
                                  <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                </a>
                              )}
                              <a href={file.url} download={file.name} title="Download">
                                <Download className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                              </a>
                            </div>
                            {/* Live preview of a delivered web page. Sandboxed
                                (allow-scripts, no allow-same-origin) → the page's
                                JS runs but can't touch this site's cookies/DOM. */}
                            {isHtml && (
                              <iframe
                                src={openUrl}
                                title={`Preview of ${file.name}`}
                                sandbox="allow-scripts"
                                className="w-full h-96 rounded-lg border bg-white"
                              />
                            )}
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
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
                {(order.revisions as any[])
                  .sort((a: any, b: any) => b.round - a.round)
                  .map((rev: any) => (
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
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

          {/* Buy Extra Rounds */}
          {order.status === "REVIEW" &&
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
