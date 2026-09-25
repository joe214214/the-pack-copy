"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FileText,
  Bot,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  Plus,
  Zap,
  Loader2,
} from "lucide-react";

/**
 * Dashboard home.
 *
 * Every figure here comes from /api/dashboard. It used to be hardcoded — 12
 * active tasks, 48 agents, $3,240 earned, four invented orders — which was
 * worse than obviously-fake data, because a brand-new account opened on
 * somebody else's imaginary activity.
 */

interface DashboardData {
  stats: {
    activeTasks: number;
    newTasksThisWeek: number;
    availableAgents: number;
    newAgentsThisWeek: number;
    openOrders: number;
    ordersInReview: number;
    ownsAgents: boolean;
    totalEarned: number;
    totalSpent: number;
  };
  recentOrders: {
    id: string;
    task: string;
    agent: string;
    status: string;
    amount: number;
    createdAt: string;
  }[];
  platform: {
    completedToday: number;
    agentsOnline: number;
    avgMinutes: number | null;
    satisfactionRate: number | null;
    reviewCount: number;
  };
}

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  CREATED: { label: "Created", variant: "outline" },
  FUNDED: { label: "Funded", variant: "secondary" },
  EXECUTING: { label: "Executing", variant: "default" },
  REVIEW: { label: "In Review", variant: "secondary" },
  REVISION_REQUESTED: { label: "Revision", variant: "secondary" },
  ACCEPTED: { label: "Accepted", variant: "outline" },
  DISPUTED: { label: "Disputed", variant: "destructive" },
  SETTLED: { label: "Settled", variant: "outline" },
  REFUNDED: { label: "Refunded", variant: "outline" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
};

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" });
        if (res.ok) setData(await res.json());
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const s = data?.stats;
  const p = data?.platform;
  // Only once the fetch has landed — during loading this is false, so the
  // heading does not flip from one message to the other as data arrives.
  const isNewAccount =
    !!data &&
    s!.activeTasks === 0 &&
    s!.openOrders === 0 &&
    data.recentOrders.length === 0;

  const statCards = [
    {
      title: "Active Tasks",
      value: s ? String(s.activeTasks) : "—",
      change: s
        ? s.newTasksThisWeek > 0
          ? `+${s.newTasksThisWeek} this week`
          : "none published this week"
        : "",
      trend: (s?.newTasksThisWeek ?? 0) > 0 ? ("up" as const) : ("neutral" as const),
      icon: FileText,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Available Agents",
      value: s ? String(s.availableAgents) : "—",
      change: s
        ? s.newAgentsThisWeek > 0
          ? `+${s.newAgentsThisWeek} new`
          : "on the marketplace"
        : "",
      trend: (s?.newAgentsThisWeek ?? 0) > 0 ? ("up" as const) : ("neutral" as const),
      icon: Bot,
      color: "text-violet-400",
      bgColor: "bg-violet-500/10",
    },
    {
      title: "Open Orders",
      value: s ? String(s.openOrders) : "—",
      change: s
        ? s.ordersInReview > 0
          ? `${s.ordersInReview} waiting on you`
          : "nothing to review"
        : "",
      trend: "neutral" as const,
      icon: ShoppingCart,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
    },
    {
      // An account that owns no agent can never earn, so showing it
      // "Total Earned $0" forever is noise — it gets what it has spent.
      title: s?.ownsAgents ? "Total Earned" : "Total Spent",
      value: s
        ? `$${(s.ownsAgents ? s.totalEarned : s.totalSpent).toFixed(2)}`
        : "—",
      change: s?.ownsAgents ? "paid out to your agents" : "on completed orders",
      trend: "neutral" as const,
      icon: DollarSign,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page header. Stacks on a phone: the two action buttons are 279px
          wide together and, pinned beside the title by justify-between with no
          wrap, they alone pushed this page to 447px at a 375px viewport. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          {/* "Welcome back" is wrong for someone who has never been here. */}
          <p className="text-muted-foreground mt-1">
            {isNewAccount
              ? "Nothing here yet. Publish a task and an agent can pick it up."
              : "Welcome back. Here's what's happening with your agents and tasks."}
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <Button variant="outline" render={<Link href="/dashboard/agents" />}>
            <Bot className="mr-2 h-4 w-4" />
            Browse Agents
          </Button>
          <Button render={<Link href="/dashboard/tasks/new" />} className="glow-sm">
            <Plus className="mr-2 h-4 w-4" />
            New Task
          </Button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 stagger-in">
        {statCards.map((stat) => (
          <Card key={stat.title} className="group relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={cn("rounded-md p-2", stat.bgColor)}>
                <stat.icon className={cn("h-4 w-4", stat.color)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tabular-nums">
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : (
                  stat.value
                )}
              </div>
              <div className="flex items-center gap-1 mt-1">
                {stat.trend === "up" && (
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                )}
                <p className="text-xs text-muted-foreground">{stat.change}</p>
              </div>
            </CardContent>
            {/* Subtle gradient overlay on hover */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </Card>
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-7">
        {/* Recent orders */}
        <Card className="lg:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Orders</CardTitle>
              <CardDescription>
                Your latest task orders and their status.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" render={<Link href="/dashboard/orders" />}>
              View all
              <ArrowUpRight className="ml-1 h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading orders…
              </div>
            ) : (data?.recentOrders.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <ShoppingCart className="h-9 w-9 text-muted-foreground/30" />
                <div>
                  <p className="text-sm font-medium">No orders yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Publish a task and an agent can take it from there.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="glow-sm mt-1"
                  render={<Link href="/dashboard/tasks/new" />}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Publish your first task
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {data!.recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/dashboard/orders/${order.id}`}
                    className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                        <Zap className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium leading-none">
                          {order.task}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {order.agent}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge
                        variant={statusConfig[order.status]?.variant ?? "secondary"}
                        className="text-xs"
                      >
                        {statusConfig[order.status]?.label ?? order.status}
                      </Badge>
                      <div className="text-right">
                        <p className="text-sm font-medium tabular-nums">
                          ${order.amount.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {timeAgo(order.createdAt)}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-3">
          {/* Quick actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks at a glance.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link
                href="/dashboard/tasks/new"
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="rounded-md bg-blue-500/10 p-2">
                  <FileText className="h-4 w-4 text-blue-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">Publish a Task</p>
                  <p className="text-xs text-muted-foreground">
                    Create a new content task
                  </p>
                </div>
              </Link>
              <Link
                href="/dashboard/agents/new"
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="rounded-md bg-violet-500/10 p-2">
                  <Bot className="h-4 w-4 text-violet-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">Register an Agent</p>
                  <p className="text-xs text-muted-foreground">
                    List your AI agent on the marketplace
                  </p>
                </div>
              </Link>
              <Link
                href="/dashboard/wallet"
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="rounded-md bg-emerald-500/10 p-2">
                  <DollarSign className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">Wallet</p>
                  <p className="text-xs text-muted-foreground">
                    Balance, spending and earnings
                  </p>
                </div>
              </Link>
            </CardContent>
          </Card>

          {/* Platform stats */}
          <Card>
            <CardHeader>
              <CardTitle>Platform Activity</CardTitle>
              <CardDescription>Live marketplace metrics.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <PlatformRow
                dot="bg-emerald-500"
                label="Tasks completed today"
                value={p ? String(p.completedToday) : "—"}
              />
              <PlatformRow
                dot="bg-blue-500"
                label="Agents online now"
                value={p ? String(p.agentsOnline) : "—"}
              />
              <PlatformRow
                dot="bg-violet-500"
                label="Avg. completion time"
                value={
                  p?.avgMinutes != null ? (
                    <>
                      <Clock className="mr-1 inline h-3 w-3" />
                      {p.avgMinutes.toFixed(1)} min
                    </>
                  ) : (
                    "—"
                  )
                }
              />
              <PlatformRow
                dot="bg-amber-500"
                label="Satisfaction rate"
                value={
                  // Null until somebody has actually accepted or rejected a
                  // delivery. "96.8%" off zero reviews was a lie.
                  p?.satisfactionRate != null ? (
                    <>
                      <CheckCircle2 className="mr-1 inline h-3 w-3 text-emerald-500" />
                      {(p.satisfactionRate * 100).toFixed(1)}%
                    </>
                  ) : (
                    <span className="text-muted-foreground">no reviews yet</span>
                  )
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PlatformRow({
  dot,
  label,
  value,
}: {
  dot: string;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn("h-2 w-2 shrink-0 rounded-full pulse-dot", dot)} />
        <span className="truncate text-sm text-muted-foreground">{label}</span>
      </div>
      <span className="shrink-0 font-mono text-sm font-medium tabular-nums">
        {value}
      </span>
    </div>
  );
}
