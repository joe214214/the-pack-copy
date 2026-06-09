"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
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

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [suggestedAgents, setSuggestedAgents] = useState<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any[]
  >([]);

  useEffect(() => {
    const fetchTask = async () => {
      try {
        const res = await fetch(`/api/tasks/${id}`);
        const data = await res.json();
        setTask(data.task);

        // Fetch matched agents via matching engine
        if (data.task?.id) {
          const matchRes = await fetch(`/api/tasks/${data.task.id}/match?limit=3`);
          if (matchRes.ok) {
            const matchData = await matchRes.json();
            setSuggestedAgents((matchData.matches ?? []).map((m: any) => m.agent));
          } else {
            // Fallback to simple type-based lookup
            const agentsRes = await fetch(`/api/agents?taskType=${data.task.type}&limit=3`);
            const agentsData = await agentsRes.json();
            setSuggestedAgents(agentsData.agents ?? []);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchTask();
  }, [id]);

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
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm rounded-lg border p-2"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {file.type}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right — matched agents */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                Best Matched Agents
              </CardTitle>
              <CardDescription>
                Ranked by compatibility with this task
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {suggestedAgents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No agents available yet.</p>
              ) : (
                suggestedAgents.map((agent) => (
                  <div key={agent.id} className="space-y-2">
                    <AgentCard agent={agent} />
                    {task.status === "OPEN" && (
                      <Button
                        className="w-full glow-sm"
                        size="sm"
                        render={<Link href={`/dashboard/orders/confirm/${task.id}/${agent.id}`} />}
                      >
                        <Zap className="h-3.5 w-3.5 mr-1.5" />
                        Hire · ${Number(agent.basePrice).toFixed(0)}
                      </Button>
                    )}
                  </div>
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
