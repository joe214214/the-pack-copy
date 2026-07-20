"use client";

import { useEffect, useState, useCallback } from "react";
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
  Bot,
  Wifi,
  WifiOff,
  DollarSign,
  Clock,
  RefreshCw,
  Zap,
  FileText,
  Copy,
  Check,
  TrendingUp,
  ShoppingCart,
  AlertTriangle,
  Star,
  Loader2,
  Plus,
  Settings,
} from "lucide-react";
import { toast } from "sonner";

const n = (v: unknown) => Number(v ?? 0);

const REFRESH_INTERVAL = 30_000; // 30 seconds

interface Agent {
  id: string;
  name: string;
  slug: string;
  apiKey: string | null;
  status: string;
  isOnline: boolean;
  lastHeartbeat: string | null;
  heartbeatInterval: number;
  dailyCompleted: number;
  dailyLimit: number;
  creditScore: number;
  creditTier: string;
  avgRating: number;
  successRate: number;
  completedOrders: number;
  supportedTaskTypes: string[];
  acceptTaskTypes: string[];
  basePrice: number;
}

interface AvailableTask {
  id: string;
  type: string;
  title: string;
  description: string;
  budget: number;
  deadlineHours: number;
  createdAt: string;
  publisher: { name: string; email: string };
}

interface ActiveOrder {
  id: string;
  price: number;
  deadline: string;
  status: string;
  task: { title: string; type: string; description: string };
  agent: { name: string; slug: string };
  execution: { status: string; heartbeatStatus: string | null; startedAt: string | null } | null;
}

interface Earnings {
  today: number;
  week: number;
  total: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function timeRemaining(deadline: string): string {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m left`;
}

const tierColors: Record<string, string> = {
  BRONZE: "text-orange-500 bg-orange-500/10 border-orange-500/30",
  SILVER: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  GOLD: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  PLATINUM: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  DIAMOND: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
};

const taskTypeColors: Record<string, string> = {
  CONTENT_WRITING: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  CONTENT_EDITING: "text-green-400 bg-green-500/10 border-green-500/30",
  SUMMARIZATION: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  DATA_EXTRACTION: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  REPORT_GENERATION: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  TRANSLATION: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  FORMATTING: "text-teal-400 bg-teal-500/10 border-teal-500/30",
  TEMPLATE_FILLING: "text-pink-400 bg-pink-500/10 border-pink-500/30",
};

function formatTaskType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Copy Button ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 gap-1.5">
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

// ─── Agent Status Card ───────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: Agent }) {
  const mcpCommand = `npx thepack-agent --key ${agent.apiKey} --url ${typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}`;

  return (
    <Card className="group relative overflow-hidden transition-all hover:shadow-md hover:shadow-primary/5 hover:border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${
                  agent.isOnline ? "bg-emerald-500 pulse-dot" : "bg-muted-foreground/30"
                }`}
              />
            </div>
            <div>
              <Link href={`/dashboard/agents/${agent.slug}`} className="hover:underline">
                <CardTitle className="text-sm">{agent.name}</CardTitle>
              </Link>
              <p className="text-xs text-muted-foreground mt-0.5">
                {agent.isOnline ? (
                  <span className="text-emerald-400">Online · {timeAgo(agent.lastHeartbeat)}</span>
                ) : (
                  <span>Offline · Last seen {timeAgo(agent.lastHeartbeat)}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className={tierColors[agent.creditTier] || ""}>
              {agent.creditTier}
            </Badge>
            {/* Owner entry point to the agent detail page (profile, Connectors, …) */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              render={<Link href={`/dashboard/agents/${agent.slug}`} />}
            >
              <Settings className="h-3 w-3" />
              Manage
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-bold">{agent.dailyCompleted}/{agent.dailyLimit}</p>
            <p className="text-[10px] text-muted-foreground">Today</p>
          </div>
          <div>
            <p className="text-lg font-bold flex items-center justify-center gap-0.5">
              <Star className="h-3 w-3 text-amber-400" />
              {agent.avgRating.toFixed(1)}
            </p>
            <p className="text-[10px] text-muted-foreground">Rating</p>
          </div>
          <div>
            <p className="text-lg font-bold">{(agent.successRate * 100).toFixed(0)}%</p>
            <p className="text-[10px] text-muted-foreground">Success</p>
          </div>
        </div>

        {/* Task types */}
        <div className="flex flex-wrap gap-1">
          {(agent.acceptTaskTypes as string[]).map((type) => (
            <Badge key={type} variant="outline" className={`text-[10px] ${taskTypeColors[type] || ""}`}>
              {formatTaskType(type)}
            </Badge>
          ))}
        </div>

        {/* Connect command */}
        <div className="rounded-md bg-muted/50 p-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">MCP Connect</p>
            <CopyButton text={mcpCommand} />
          </div>
          <code className="text-[10px] text-muted-foreground break-all leading-relaxed block">
            {mcpCommand}
          </code>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Available Task Row ──────────────────────────────────────────────────────

function TaskRow({
  task,
  agents,
  onAssigned,
}: {
  task: AvailableTask;
  agents: Agent[];
  onAssigned: () => void;
}) {
  // Agents the current user owns that can actually take this task
  const eligible = agents.filter(
    (a) => a.status === "ACTIVE" && a.supportedTaskTypes.includes(task.type)
  );
  const [selectedAgent, setSelectedAgent] = useState(eligible[0]?.id ?? "");
  const [assigning, setAssigning] = useState(false);

  const assign = async () => {
    if (!selectedAgent) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selectedAgent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to assign");
      const agentName = eligible.find((a) => a.id === selectedAgent)?.name ?? "agent";
      toast.success(`Assigned to ${agentName}. It will pick up the job via get_assigned_jobs.`);
      onAssigned();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-none truncate">{task.title}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className={`text-[10px] ${taskTypeColors[task.type] || ""}`}>
              {formatTaskType(task.type)}
            </Badge>
            <span className="text-xs text-muted-foreground">by {task.publisher.name}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-3">
        <div className="text-right">
          <p className="text-sm font-bold text-emerald-400">${task.budget.toFixed(0)}</p>
          <p className="text-[10px] text-muted-foreground flex items-center gap-0.5 justify-end">
            <Clock className="h-2.5 w-2.5" />
            {task.deadlineHours}h
          </p>
        </div>
        {eligible.length > 0 ? (
          <div className="flex items-center gap-1">
            {eligible.length > 1 && (
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="h-8 rounded-md border bg-background px-1.5 text-xs max-w-28"
              >
                {eligible.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
            <Button
              size="sm"
              className="h-8 text-xs glow-sm"
              onClick={assign}
              disabled={assigning}
            >
              {assigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
              Assign
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="h-8 text-xs" render={<Link href={`/dashboard/tasks/${task.id}`} />}>
            View
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Active Order Row ────────────────────────────────────────────────────────

function ActiveOrderRow({ order }: { order: ActiveOrder }) {
  const isReview = order.status === "REVIEW";
  return (
    <div className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${isReview ? "bg-amber-500/10" : "bg-blue-500/10"}`}>
          <Zap className={`h-4 w-4 ${isReview ? "text-amber-400" : "text-blue-400"}`} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-none truncate">{order.task.title}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {order.agent.name} · {isReview ? "Awaiting Review" : "Executing..."}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-3">
        <div className="text-right">
          <p className="text-sm font-medium">${n(order.price).toFixed(0)}</p>
          <p className={`text-[10px] flex items-center gap-0.5 justify-end ${
            new Date(order.deadline) < new Date() ? "text-rose-400" : "text-muted-foreground"
          }`}>
            <Clock className="h-2.5 w-2.5" />
            {timeRemaining(order.deadline)}
          </p>
        </div>
        <Badge variant={isReview ? "secondary" : "default"} className="text-[10px]">
          {isReview ? "Review" : "Running"}
        </Badge>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function WorkerDashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [availableTasks, setAvailableTasks] = useState<AvailableTask[]>([]);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [earnings, setEarnings] = useState<Earnings>({ today: 0, week: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await fetch(`/api/worker/dashboard`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();

      setAgents(data.agents);
      setAvailableTasks(data.availableTasks);
      setActiveOrders(data.activeOrders);
      setEarnings(data.earnings);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Failed to fetch worker data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load + auto-refresh
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading worker dashboard...
      </div>
    );
  }

  const onlineCount = agents.filter((a) => a.isOnline).length;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Worker Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage your agents, view available tasks, and track earnings.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            Auto-refreshes every 30s · Last: {lastRefresh.toLocaleTimeString()}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Earnings Stats */}
      <div className="grid gap-4 md:grid-cols-4 stagger-in">
        <Card className="group relative overflow-hidden transition-all hover:shadow-md hover:shadow-primary/5 hover:border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">My Agents</CardTitle>
            <div className="rounded-md p-2 bg-violet-500/10">
              <Bot className="h-4 w-4 text-violet-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{agents.length}</div>
            <div className="flex items-center gap-1 mt-1">
              {onlineCount > 0 ? (
                <Wifi className="h-3 w-3 text-emerald-500" />
              ) : (
                <WifiOff className="h-3 w-3 text-muted-foreground" />
              )}
              <p className="text-xs text-muted-foreground">{onlineCount} online</p>
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all hover:shadow-md hover:shadow-primary/5 hover:border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Available Tasks</CardTitle>
            <div className="rounded-md p-2 bg-blue-500/10">
              <FileText className="h-4 w-4 text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{availableTasks.length}</div>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              <p className="text-xs text-muted-foreground">Matching your skills</p>
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all hover:shadow-md hover:shadow-primary/5 hover:border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Jobs</CardTitle>
            <div className="rounded-md p-2 bg-amber-500/10">
              <ShoppingCart className="h-4 w-4 text-amber-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeOrders.length}</div>
            <div className="flex items-center gap-1 mt-1">
              {activeOrders.some(o => new Date(o.deadline) < new Date()) ? (
                <>
                  <AlertTriangle className="h-3 w-3 text-rose-400" />
                  <p className="text-xs text-rose-400">Has overdue</p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">All on schedule</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition-all hover:shadow-md hover:shadow-primary/5 hover:border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Earned</CardTitle>
            <div className="rounded-md p-2 bg-emerald-500/10">
              <DollarSign className="h-4 w-4 text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${earnings.total.toFixed(2)}</div>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              <p className="text-xs text-muted-foreground">${earnings.today.toFixed(2)} today</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent Status Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            My Agents
          </h2>
          <Button size="sm" className="glow-sm" render={<Link href="/dashboard/agents/new" />}>
            <Plus className="mr-1.5 h-4 w-4" />
            Register Agent
          </Button>
        </div>
        {agents.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bot className="h-12 w-12 mb-4 opacity-30" />
              <p className="font-medium">No agents registered</p>
              <p className="text-sm mt-1 mb-4">Register an AI agent to start earning.</p>
              <Button size="sm" render={<Link href="/dashboard/agents/new" />}>
                <Plus className="mr-1.5 h-4 w-4" />
                Register your first agent
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>

      {/* Main content: Available Tasks + Active Jobs */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Available Tasks */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-400" />
                Available Tasks
              </CardTitle>
              <CardDescription>
                Tasks matching your agents&apos; capabilities. Refreshes every 30s.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-emerald-400 bg-emerald-500/10 border-emerald-500/30">
              {availableTasks.length} available
            </Badge>
          </CardHeader>
          <CardContent>
            {availableTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <FileText className="h-10 w-10 mb-3 opacity-20" />
                <p className="text-sm font-medium">No matching tasks right now</p>
                <p className="text-xs mt-1">New tasks will appear here automatically.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {availableTasks.map((task) => (
                  <TaskRow key={task.id} task={task} agents={agents} onAssigned={() => fetchData(true)} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Jobs */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              Active Jobs
            </CardTitle>
            <CardDescription>Tasks currently being executed by your agents.</CardDescription>
          </CardHeader>
          <CardContent>
            {activeOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Zap className="h-10 w-10 mb-3 opacity-20" />
                <p className="text-sm font-medium">No active jobs</p>
                <p className="text-xs mt-1">Claim a task to start working.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeOrders.map((order) => (
                  <ActiveOrderRow key={order.id} order={order} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Earnings breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-400" />
            Earnings Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div className="rounded-lg border p-4">
              <p className="text-2xl font-bold text-emerald-400">${earnings.today.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">Today</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-2xl font-bold text-blue-400">${earnings.week.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">This Week</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-2xl font-bold text-violet-400">${earnings.total.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">All Time</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
