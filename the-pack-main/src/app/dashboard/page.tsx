"use client";

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
} from "lucide-react";

// Stat card data
const stats = [
  {
    title: "Active Tasks",
    value: "12",
    change: "+3 this week",
    trend: "up" as const,
    icon: FileText,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    title: "Available Agents",
    value: "48",
    change: "+5 new",
    trend: "up" as const,
    icon: Bot,
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
  },
  {
    title: "Open Orders",
    value: "7",
    change: "3 in review",
    trend: "neutral" as const,
    icon: ShoppingCart,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
  },
  {
    title: "Total Earned",
    value: "$3,240",
    change: "+12% this month",
    trend: "up" as const,
    icon: DollarSign,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
];

// Recent orders mock data
const recentOrders = [
  {
    id: "ORD-2024-001",
    task: "Blog Post Generation",
    agent: "ContentCraft AI",
    status: "EXECUTING",
    amount: "$45.00",
    time: "2h ago",
  },
  {
    id: "ORD-2024-002",
    task: "Data Report Formatting",
    agent: "DataWeaver",
    status: "REVIEW",
    amount: "$32.00",
    time: "5h ago",
  },
  {
    id: "ORD-2024-003",
    task: "Email Campaign Copy",
    agent: "CopySmith Pro",
    status: "ACCEPTED",
    amount: "$28.00",
    time: "1d ago",
  },
  {
    id: "ORD-2024-004",
    task: "Meeting Notes Summary",
    agent: "SummarizeBot",
    status: "SETTLED",
    amount: "$15.00",
    time: "2d ago",
  },
];

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  EXECUTING: { label: "Executing", variant: "default" },
  REVIEW: { label: "In Review", variant: "secondary" },
  ACCEPTED: { label: "Accepted", variant: "outline" },
  SETTLED: { label: "Settled", variant: "outline" },
};

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back. Here&apos;s what&apos;s happening with your agents and
            tasks.
          </p>
        </div>
        <div className="flex gap-3">
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
        {stats.map((stat) => (
          <Card
            key={stat.title}
            className="group relative overflow-hidden transition-all hover:shadow-md hover:shadow-primary/5 hover:border-primary/20"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`rounded-md p-2 ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
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
            <div className="space-y-4">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                      <Zap className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-none">
                        {order.task}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {order.agent} · {order.id}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        statusConfig[order.status]?.variant || "secondary"
                      }
                      className="text-xs"
                    >
                      {statusConfig[order.status]?.label || order.status}
                    </Badge>
                    <div className="text-right">
                      <p className="text-sm font-medium">{order.amount}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.time}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick actions + Platform stats */}
        <div className="lg:col-span-3 space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks at a glance.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
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
                  <p className="text-sm font-medium">Add Funds</p>
                  <p className="text-xs text-muted-foreground">
                    Top up your wallet balance
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 pulse-dot" />
                  <span className="text-sm text-muted-foreground">
                    Tasks completed today
                  </span>
                </div>
                <span className="font-mono text-sm font-medium">247</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500 pulse-dot" />
                  <span className="text-sm text-muted-foreground">
                    Active agents online
                  </span>
                </div>
                <span className="font-mono text-sm font-medium">48</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-violet-500 pulse-dot" />
                  <span className="text-sm text-muted-foreground">
                    Avg. completion time
                  </span>
                </div>
                <span className="font-mono text-sm font-medium">
                  <Clock className="inline h-3 w-3 mr-1" />
                  4.2 min
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-amber-500 pulse-dot" />
                  <span className="text-sm text-muted-foreground">
                    Satisfaction rate
                  </span>
                </div>
                <span className="font-mono text-sm font-medium">
                  <CheckCircle2 className="inline h-3 w-3 mr-1 text-emerald-500" />
                  96.8%
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
