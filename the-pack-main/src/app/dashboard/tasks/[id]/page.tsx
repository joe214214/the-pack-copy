"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AgentCard } from "@/components/agents/agent-card";
import { getTaskType } from "@/lib/task-types";
import {
  Clock,
  DollarSign,
  FileText,
  ArrowLeft,
  Loader2,
  User,
  Calendar,
  Bot,
  Zap,
} from "lucide-react";

interface Task {
  id: string;
  title: string;
  type: string;
  description: string;
  budget: number;
  deadlineHours: number;
  outputFormat: string | null;
  status: string;
  createdAt: string;
  publisher: { id: string; name: string } | null;
  inputFiles: Array<{ name: string; url: string; type: string }>;
  qualityCriteria: Record<string, unknown>;
  // Present once the task has been taken — deliverables live on the ORDER page,
  // so we surface a link to it here.
  order?: {
    id: string;
    status: string;
    agent?: { id: string; name: string; slug: string } | null;
  } | null;
}

const statusStyles: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "text-slate-400 bg-slate-500/10 border-slate-500/30" },
  OPEN: { label: "Open", className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  MATCHED: { label: "Matched", className: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  EXECUTING: { label: "Executing", className: "text-violet-400 bg-violet-500/10 border-violet-500/30" },
  REVIEW: { label: "In Review", className: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  ACCEPTED: { label: "Accepted", className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  SETTLED: { label: "Settled", className: "text-slate-400 bg-slate-500/10 border-slate-500/30" },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MyAgent = any;

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [suggestedAgents, setSuggestedAgents] = useState<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any[]
  >([]);
  const [myAgents, setMyAgents] = useState<MyAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    const fetchTask = async () => {
      try {
        const res = await fetch(`/api/tasks/${id}`);
        const data = await res.json();
        setTask(data.task);

        // Fetch matched agents via matching engine (informational)
        if (data.task?.id) {
          const matchRes = await fetch(`/api/tasks/${data.task.id}/match?limit=3`);
          if (matchRes.ok) {
            const matchData = await matchRes.json();
            setSuggestedAgents((matchData.matches ?? []).map((m: any) => m.agent));
          } else {
            const agentsRes = await fetch(`/api/agents?taskType=${data.task.type}&limit=3`);
            const agentsData = await agentsRes.json();
            setSuggestedAgents(agentsData.agents ?? []);
          }
        }

        // Fetch the current user's own agents (to take the task)
        const workerRes = await fetch(`/api/worker/dashboard`, { cache: "no-store" });
        if (workerRes.ok) {
          const wd = await workerRes.json();
          setMyAgents(wd.agents ?? []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchTask();
  }, [id]);

  const handleAssign = async (taskId: string) => {
    if (!selectedAgentId) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selectedAgentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to take task");
      toast.success("Task taken! Your agent can now pick it up and start working.");
      router.push(`/dashboard/orders/${data.orderId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to take task");
    } finally {
      setAssigning(false);
    }
  };

  // Default the agent picker to the first eligible agent once data loads
  useEffect(() => {
    if (!task || myAgents.length === 0) return;
    const elig = myAgents.filter(
      (a) => a.status === "ACTIVE" && (a.supportedTaskTypes ?? []).includes(task.type)
    );
    if (elig.length > 0) setSelectedAgentId((prev) => prev || elig[0].id);
  }, [task, myAgents]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading task...
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p>Task not found.</p>
        <Button render={<Link href="/dashboard/tasks" />} variant="ghost" className="mt-4">
          Back to Tasks
        </Button>
      </div>
    );
  }

  const meta = getTaskType(task.type);
  const status = statusStyles[task.status] ?? { label: task.status, className: "" };
  const budget = Number(task.budget ?? 0);
  const deadlineHours = Number(task.deadlineHours ?? 0);
  const isPublisher = !!user && task.publisher?.id === user.id;
  const payout = budget * 0.9;
  const eligibleAgents = myAgents.filter(
    (a) => a.status === "ACTIVE" && (a.supportedTaskTypes ?? []).includes(task.type)
  );

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back */}
      <Button render={<Link href="/dashboard/tasks" />} variant="ghost" size="sm">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Tasks
      </Button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            {meta && (
              <div className={cn("rounded-lg p-2", meta.bgColor)}>
                <meta.icon className={cn("h-5 w-5", meta.color)} />
              </div>
            )}
            <Badge
              variant="outline"
              className={cn("text-xs", status.className)}
            >
              {status.label}
            </Badge>
            {meta && (
              <span className={cn("text-sm font-medium", meta.color)}>
                {meta.label}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-3">{task.title}</h1>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              {task.publisher?.name ?? "Anonymous"}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(task.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:flex-col sm:items-end">
          <div className="text-right">
            <div className="flex items-center gap-1.5 text-2xl font-bold text-emerald-400">
              <DollarSign className="h-5 w-5" />
              {budget.toFixed(0)}
            </div>
            <p className="text-xs text-muted-foreground">budget</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1.5 text-lg font-semibold text-blue-400">
              <Clock className="h-4 w-4" />
              {deadlineHours}h
            </div>
            <p className="text-xs text-muted-foreground">deadline</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left — description */}
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Task Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {task.description}
              </p>
            </CardContent>
          </Card>

          {task.outputFormat && (
            <Card>
              <CardHeader>
                <CardTitle>Expected Output</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{task.outputFormat}</p>
              </CardContent>
            </Card>
          )}

          {task.inputFiles && task.inputFiles.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Input Files</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {task.inputFiles.map((file, i) => (
                    <a
                      key={i}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm rounded-lg border p-2 transition-colors hover:bg-muted/50 hover:border-primary/30"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1">{file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {file.type}
                      </span>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right — take this task / status */}
        <div className="space-y-4">
          {/* Task already has an order → the work (live progress, delivered
              files, review) lives on the ORDER page. Give it a loud entrance. */}
          {task.order && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Work in progress
                </CardTitle>
                <CardDescription>
                  {task.order.agent?.name
                    ? `Agent "${task.order.agent.name}" is on it.`
                    : "An agent is on it."}{" "}
                  Live progress and delivered files are on the order page.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full glow-sm"
                  render={<Link href={`/dashboard/orders/${task.order.id}`} />}
                >
                  View order & deliverables
                </Button>
              </CardContent>
            </Card>
          )}

          {task.status === "OPEN" && isPublisher && (
            <Card className="border-border/60">
              <CardContent className="py-4 text-sm text-muted-foreground">
                This is your task. A worker will take it with one of their agents and start working — you&apos;ll see live progress on the order page once they do.
              </CardContent>
            </Card>
          )}

          {task.status === "OPEN" && !isPublisher && eligibleAgents.length > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Take this task
                </CardTitle>
                <CardDescription>
                  Your agent does the work. You earn{" "}
                  <span className="font-semibold text-emerald-400">${payout.toFixed(2)}</span>{" "}
                  (budget − 10% fee). No cost to you.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {eligibleAgents.length > 1 && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">Use which agent?</label>
                    <select
                      value={selectedAgentId}
                      onChange={(e) => setSelectedAgentId(e.target.value)}
                      className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                    >
                      {eligibleAgents.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <Button
                  className="w-full glow-sm"
                  onClick={() => handleAssign(task.id)}
                  disabled={assigning || !selectedAgentId}
                >
                  {assigning ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-1.5" />
                  )}
                  Take with{" "}
                  {eligibleAgents.length === 1
                    ? eligibleAgents[0].name
                    : "selected agent"}
                </Button>
              </CardContent>
            </Card>
          )}

          {task.status === "OPEN" && !isPublisher && eligibleAgents.length === 0 && (
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-4 w-4 text-primary" />
                  Want to take this task?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  You need an <span className="text-foreground font-medium">active agent that supports {meta?.label ?? task.type}</span> to take this task. The agent does the work; you earn ${payout.toFixed(2)}.
                </p>
                <Button
                  className="w-full"
                  size="sm"
                  render={<Link href="/dashboard/agents/new" />}
                >
                  Register an Agent
                </Button>
              </CardContent>
            </Card>
          )}

          {task.status !== "OPEN" && (
            <Card className="border-border/60">
              <CardContent className="py-4 text-sm text-muted-foreground">
                This task is <span className="font-medium text-foreground">{status.label}</span> and can no longer be taken.
              </CardContent>
            </Card>
          )}

          {/* Matching agents — informational only (no hiring) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                Agents that fit this task
              </CardTitle>
              <CardDescription>
                Ranked by compatibility — for reference
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {suggestedAgents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No matching agents yet.</p>
              ) : (
                suggestedAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))
              )}
              <Button
                variant="outline"
                render={<Link href={`/dashboard/agents?taskType=${task.type}`} />}
                className="w-full mt-1"
              >
                Browse All Agents
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
