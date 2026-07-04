"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users, Bot, FileText, ShoppingCart, DollarSign, TrendingUp,
  AlertTriangle, CheckCircle2, Loader2, BarChart2, Zap, Shield,
  Star, Activity, Clock,
} from "lucide-react";

const n = (v: unknown) => Number(v ?? 0);

// ─── Status color map ─────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  CREATED:   "text-blue-400 bg-blue-500/10 border-blue-500/30",
  EXECUTING: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  REVIEW:    "text-amber-400 bg-amber-500/10 border-amber-500/30",
  ACCEPTED:  "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  SETTLED:   "text-slate-400 bg-slate-500/10 border-slate-500/30",
  CANCELLED: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  DISPUTED:  "text-orange-400 bg-orange-500/10 border-orange-500/30",
};

// ─── Big Stat Card ────────────────────────────────────────────────────────────
function BigStat({
  label, value, sub, icon, color,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{label}</p>
            <p className={cn("text-3xl font-bold mt-1", color)}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={cn("p-2.5 rounded-xl opacity-80", color.replace("text-", "bg-").replace(/\w+$/, "500/10"))}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Status Donut ─────────────────────────────────────────────────────────────
function StatusPill({ status, count }: { status: string; count: number }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <Badge variant="outline" className={cn("text-xs", STATUS_COLORS[status] ?? "text-muted-foreground")}>
        {status}
      </Badge>
      <span className="text-sm font-semibold">{count}</span>
    </div>
  );
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StatsData = any;

export default function AdminPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch("/api/admin/stats");
        setStats(await res.json());
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetch_();
    const interval = setInterval(fetch_, 30000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading platform analytics...
      </div>
    );
  }

  const totals = stats?.totals ?? {};
  const statusMap: Record<string, number> = stats?.ordersByStatus ?? {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Admin Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Platform analytics · Auto-refreshes every 30s
          </p>
        </div>
        <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 bg-emerald-500/10 gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live
        </Badge>
      </div>

      {/* Top stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BigStat label="Total Users" value={totals.users ?? 0} icon={<Users className="h-5 w-5" />} color="text-blue-400" />
        <BigStat label="Active Agents" value={totals.agents ?? 0} icon={<Bot className="h-5 w-5" />} color="text-violet-400" />
        <BigStat label="Tasks" value={totals.tasks ?? 0} icon={<FileText className="h-5 w-5" />} color="text-cyan-400" />
        <BigStat label="Orders" value={totals.orders ?? 0} icon={<ShoppingCart className="h-5 w-5" />} color="text-emerald-400" />
      </div>

      {/* Revenue stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <BigStat
          label="Platform Revenue"
          value={`$${n(totals.revenue).toFixed(2)}`}
          sub="10% platform fee"
          icon={<DollarSign className="h-5 w-5" />}
          color="text-emerald-400"
        />
        <BigStat
          label="Total Volume"
          value={`$${n(totals.volume).toFixed(2)}`}
          sub="Settled orders"
          icon={<BarChart2 className="h-5 w-5" />}
          color="text-blue-400"
        />
        <BigStat
          label="Agent Payouts"
          value={`$${n(totals.agentPayouts).toFixed(2)}`}
          sub="After platform fee"
          icon={<Zap className="h-5 w-5" />}
          color="text-violet-400"
        />
      </div>

      {/* Main 3-col */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Recent Orders */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" />
                Recent Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-0 divide-y divide-border/40">
                {(stats?.recentOrders ?? []).map((order: any) => (
                  <div key={order.id} className="py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{order.taskTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.publisherName} → {order.agentName}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">${n(order.price).toFixed(0)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="outline" className={cn("text-xs shrink-0", STATUS_COLORS[order.status] ?? "")}>
                      {order.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      render={<Link href={`/dashboard/orders/${order.id}`} />}
                      className="h-7 w-7 p-0 shrink-0"
                    >
                      <Zap className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right col */}
        <div className="space-y-5">
          {/* Order status breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">
                Orders by Status
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border/30">
              {Object.entries(statusMap).map(([status, count]) => (
                <StatusPill key={status} status={status} count={count} />
              ))}
              {Object.keys(statusMap).length === 0 && (
                <p className="text-sm text-muted-foreground py-2">No orders yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Top Agents */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">
                Top Agents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(stats?.topAgents ?? []).map((agent: any, i: number) => (
                <div key={agent.id} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                  <Button
                    variant="link"
                    className="p-0 h-auto text-sm font-medium flex-1 text-left justify-start"
                    render={<Link href={`/dashboard/agents/${agent.slug}`} />}
                  >
                    {agent.name}
                  </Button>
                  <span className="text-xs text-muted-foreground">{n(agent.completedOrders)} done</span>
                  <span className="flex items-center gap-0.5 text-amber-400 text-xs">
                    <Star className="h-3 w-3 fill-amber-400" />{n(agent.avgRating).toFixed(1)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Open Disputes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground uppercase tracking-wider font-semibold">
                <AlertTriangle className="h-4 w-4 text-orange-400" />
                Open Disputes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(stats?.disputes ?? []).filter((d: any) => d.status === "OPEN").length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  No open disputes
                </div>
              ) : (
                (stats?.disputes ?? []).filter((d: any) => d.status === "OPEN").map((d: any) => (
                  <div key={d.id} className="text-sm border rounded-lg p-2.5 border-orange-500/20 bg-orange-500/5">
                    <p className="font-medium text-orange-300 truncate">{d.taskTitle}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{d.reason}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {new Date(d.createdAt).toLocaleDateString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 text-xs ml-auto p-1"
                        render={<Link href={`/dashboard/orders/${d.orderId}`} />}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
