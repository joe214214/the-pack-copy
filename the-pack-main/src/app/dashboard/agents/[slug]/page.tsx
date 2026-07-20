"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreditTierBadge } from "@/components/agents/credit-tier-badge";
import { getTaskType } from "@/lib/task-types";
import {
  ArrowLeft,
  Star,
  CheckCircle2,
  Clock,
  ShoppingCart,
  Bot,
  Loader2,
  Zap,
  User,
  Code2,
  Trophy,
  Wifi,
  Activity,
  Plug,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AgentDetail = any;

// claude.ai connectors an owner can approve for their agent. `server` is the MCP
// server name the runner matches against; `sensitive` connectors touch private
// accounts/data, so we warn before the owner hands them to a rented worker.
const KNOWN_CONNECTORS: {
  server: string;
  label: string;
  desc: string;
  sensitive: boolean;
}[] = [
  { server: "claude_ai_Figma", label: "Figma", desc: "Create & read designs, diagrams, FigJam boards", sensitive: false },
  { server: "claude_ai_Google_Drive", label: "Google Drive", desc: "Read/write files in your Drive", sensitive: true },
  { server: "claude_ai_Interactive_Brokers", label: "Interactive Brokers", desc: "Trading & account access", sensitive: true },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            "h-4 w-4",
            star <= Math.round(rating)
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30"
          )}
        />
      ))}
    </div>
  );
}

export default function AgentProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Current viewer — used to show the owner-only Connectors card.
  const [me, setMe] = useState<{ id: string; isAdmin?: boolean } | null>(null);
  const [connSel, setConnSel] = useState<string[]>([]);
  const [connSaving, setConnSaving] = useState(false);
  const [connSaved, setConnSaved] = useState(false);
  const [connRefreshing, setConnRefreshing] = useState(false);

  useEffect(() => {
    const fetchAgent = async () => {
      try {
        const res = await fetch(`/api/agents/${slug}`);
        const data = await res.json();
        setAgent(data.agent);
        setConnSel(Array.isArray(data.agent?.allowedConnectors) ? data.agent.allowedConnectors : []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (slug) fetchAgent();
  }, [slug]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d?.user ?? null))
      .catch(() => setMe(null));
  }, []);

  const isOwner = !!(me && agent && (me.id === agent.owner?.id || me.isAdmin));

  function toggleConnector(server: string) {
    setConnSel((prev) =>
      prev.includes(server) ? prev.filter((s) => s !== server) : [...prev, server]
    );
    setConnSaved(false);
  }

  // Re-fetch the agent to pick up connectors newly reported by the runner
  // (e.g. one just added in Claude Desktop). Resets unsaved ticks to the
  // saved state — refresh means "show me the current truth".
  async function refreshConnectors() {
    setConnRefreshing(true);
    try {
      const res = await fetch(`/api/agents/${slug}`);
      const data = await res.json();
      if (data.agent) {
        setAgent(data.agent);
        setConnSel(Array.isArray(data.agent.allowedConnectors) ? data.agent.allowedConnectors : []);
        setConnSaved(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setConnRefreshing(false);
    }
  }

  // The checklist = connectors detected on the owner's Claude account (reported
  // by the runner via heartbeat), falling back to the curated list before the
  // first report, plus anything already approved (so it never disappears).
  const detectedConnectors: string[] = Array.isArray(agent?.availableConnectors)
    ? agent.availableConnectors
    : [];
  const connectorServers: string[] = Array.from(
    new Set([
      ...(detectedConnectors.length ? detectedConnectors : KNOWN_CONNECTORS.map((c) => c.server)),
      ...connSel,
    ])
  );

  async function saveConnectors() {
    setConnSaving(true);
    setConnSaved(false);
    try {
      const res = await fetch(`/api/agents/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedConnectors: connSel }),
      });
      if (res.ok) {
        const data = await res.json();
        setConnSel(data.agent?.allowedConnectors ?? connSel);
        setConnSaved(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setConnSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading agent...
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Bot className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p>Agent not found.</p>
        <Button render={<Link href="/dashboard/agents" />} variant="ghost" className="mt-4">
          Back to Marketplace
        </Button>
      </div>
    );
  }

  // Prisma v7 + pg adapter returns Decimal fields as strings → coerce
  const n = (v: unknown): number => Number(v ?? 0);
  const avgMins = Math.round(n(agent.avgDurationSecs) / 60);
  const avgRating = n(agent.avgRating);
  const successRate = n(agent.successRate);
  const basePrice = n(agent.basePrice);
  const avgCost = n(agent.avgCost);
  const creditScore = n(agent.creditScore);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back */}
      <Button render={<Link href="/dashboard/agents" />} variant="ghost" size="sm">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Marketplace
      </Button>

      {/* Hero section */}
      <div className="rounded-xl border bg-card/80 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-6">
          {/* Avatar */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bot className="h-8 w-8" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {/* Online status dot */}
              <span
                className={cn(
                  "relative flex h-3 w-3 shrink-0 rounded-full",
                  agent.isOnline ? "bg-emerald-500" : "bg-muted-foreground/40"
                )}
              >
                {agent.isOnline && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
              </span>
              <h1 className="text-2xl font-bold">{agent.name}</h1>
              <CreditTierBadge tier={agent.creditTier} />
              {agent.connectionType && (
                <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
                  <Wifi className="h-3 w-3" />
                  {agent.connectionType}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm mt-1">{agent.description}</p>

            {/* Task types */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {agent.supportedTaskTypes.map((typeId: string) => {
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
            </div>
          </div>

          {/* Hire button */}
          <div className="shrink-0">
            <Button
              render={<Link href={`/dashboard/tasks/new`} />}
              className="glow w-full sm:w-auto"
            >
              <Zap className="mr-2 h-4 w-4" />
              Hire This Agent
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-2">
              From ${basePrice.toFixed(0)}/task
            </p>
          </div>
        </div>
      </div>

      {/* Stats + details */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Performance stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {
                label: "Avg Rating",
                value: (
                  <div className="space-y-1">
                    <span className="text-2xl font-bold text-amber-400">
                      {avgRating.toFixed(1)}
                    </span>
                    <StarRating rating={avgRating} />
                  </div>
                ),
                icon: Star,
                color: "text-amber-400",
                bg: "bg-amber-500/10",
              },
              {
                label: "Success Rate",
                value: (
                  <span className="text-2xl font-bold text-emerald-400">
                    {Math.round(successRate * 100)}%
                  </span>
                ),
                icon: CheckCircle2,
                color: "text-emerald-400",
                bg: "bg-emerald-500/10",
              },
              {
                label: "Avg Time",
                value: (
                  <span className="text-2xl font-bold text-blue-400">{avgMins}m</span>
                ),
                icon: Clock,
                color: "text-blue-400",
                bg: "bg-blue-500/10",
              },
              {
                label: "Completed",
                value: (
                  <span className="text-2xl font-bold text-violet-400">
                    {n(agent.completedOrders).toLocaleString()}
                  </span>
                ),
                icon: ShoppingCart,
                color: "text-violet-400",
                bg: "bg-violet-500/10",
              },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="pt-4 pb-3">
                  <div className={cn("inline-flex rounded-md p-1.5 mb-2", stat.bg)}>
                    <stat.icon className={cn("h-4 w-4", stat.color)} />
                  </div>
                  <div>{stat.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Sample outputs */}
          {agent.sampleOutputs && Object.keys(agent.sampleOutputs).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-primary" />
                  Sample Outputs
                </CardTitle>
                <CardDescription>Examples of this agent&apos;s work</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(agent.sampleOutputs).map(([key, value]) => (
                  <div key={key} className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </p>
                    <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono leading-relaxed">
                      {String(value)}
                    </pre>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recent reviews */}
          {agent.orders && agent.orders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  Recent Reviews
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {agent.orders.map((order: any) => {
                  const review = order.review;
                  if (!review?.userComment) return null;
                  const taskMeta = getTaskType(order.task?.type ?? "");
                  return (
                    <div key={order.id} className="border-b border-border/40 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between mb-2">
                        {taskMeta && (
                          <Badge
                            variant="secondary"
                            className={cn("text-xs gap-1", taskMeta.color, taskMeta.bgColor)}
                          >
                            <taskMeta.icon className="h-3 w-3" />
                            {taskMeta.label}
                          </Badge>
                        )}
                        {review.userRating && (
                          <StarRating rating={review.userRating} />
                        )}
                      </div>
                      <p className="text-sm text-foreground/80 italic">
                        &ldquo;{review.userComment}&rdquo;
                      </p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column — metadata */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Agent Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Model</p>
                  <p className="font-medium">{agent.modelInfo}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Owner</p>
                  <p className="font-medium">{agent.owner?.name ?? "Unknown"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Base Price</p>
                  <p className="font-medium">${basePrice.toFixed(0)}/task</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Credit Score</p>
                  <p className="font-medium">
                    {(creditScore * 100).toFixed(1)}
                    <span className="text-muted-foreground">/100</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* MCP / Live Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Live Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    agent.isOnline
                      ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                      : "border-muted-foreground/30 text-muted-foreground"
                  )}
                >
                  {agent.isOnline ? "🟢 Online" : "⚫ Offline"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Today&apos;s quota</span>
                <span className="font-medium">
                  {n(agent.dailyCompleted)} / {n(agent.dailyLimit)}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    n(agent.dailyCompleted) >= n(agent.dailyLimit)
                      ? "bg-rose-500"
                      : "bg-emerald-500"
                  )}
                  style={{
                    width: `${Math.min(100, (n(agent.dailyCompleted) / Math.max(1, n(agent.dailyLimit))) * 100)}%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Owner-only: approve which claude.ai connectors this agent may use */}
          {isOwner && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Plug className="h-4 w-4 text-primary" />
                    Connectors
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={refreshConnectors}
                    disabled={connRefreshing}
                  >
                    <RefreshCw className={cn("h-3 w-3", connRefreshing && "animate-spin")} />
                    Refresh
                  </Button>
                </CardTitle>
                <CardDescription>
                  Local tools, skills and plugins are always available to your
                  agent — no approval needed. Only your Claude account&apos;s
                  connectors are gated: tick the ones this agent may use.
                  Refresh picks up connectors newly added to your account
                  (detected by your runner while it&apos;s online).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {connectorServers.map((server) => {
                  const known = KNOWN_CONNECTORS.find((c) => c.server === server);
                  const checked = connSel.includes(server);
                  const label =
                    known?.label ??
                    server.replace(/^claude_ai_/, "").replace(/_/g, " ");
                  return (
                    <label
                      key={server}
                      className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3 cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleConnector(server)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{label}</span>
                          {known?.sensitive && (
                            <Badge
                              variant="outline"
                              className="text-[10px] gap-1 border-amber-500/50 text-amber-500 bg-amber-500/10"
                            >
                              <ShieldAlert className="h-3 w-3" />
                              Sensitive
                            </Badge>
                          )}
                        </div>
                        {known?.desc && (
                          <p className="text-xs text-muted-foreground mt-0.5">{known.desc}</p>
                        )}
                      </div>
                    </label>
                  );
                })}

                {connSel.some((s) =>
                  KNOWN_CONNECTORS.some((c) => c.server === s && c.sensitive)
                ) && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-500">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    A sensitive connector is enabled — this agent can act on that
                    account while doing others&apos; tasks. Only enable what you trust.
                  </p>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <Button size="sm" onClick={saveConnectors} disabled={connSaving}>
                    {connSaving ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      "Save connectors"
                    )}
                  </Button>
                  {connSaved && (
                    <span className="flex items-center gap-1 text-xs text-emerald-500">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Saved
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base price</span>
                <span className="font-medium">${basePrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg actual cost</span>
                <span className="font-medium">
                  {avgCost > 0 ? `$${avgCost.toFixed(2)}` : "—"}
                </span>
              </div>
              <div className="flex justify-between border-t border-border/40 pt-2">
                <span className="text-muted-foreground">Platform fee</span>
                <span className="text-muted-foreground">10%</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
