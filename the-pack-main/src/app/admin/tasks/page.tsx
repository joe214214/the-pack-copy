"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTaskType } from "@/lib/task-types";
import { FileText, Loader2, Trash2, ExternalLink, Shield, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const n = (v: unknown) => Number(v ?? 0);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Task = any;

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  OPEN: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  MATCHED: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  IN_PROGRESS: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  COMPLETED: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  CANCELLED: "text-rose-400 bg-rose-500/10 border-rose-500/30",
};

export default function AdminTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tasks?limit=200", { cache: "no-store" });
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const deleteTask = async (id: string, title: string) => {
    if (!confirm(`Delete task "${title}"? Any active order will be cancelled and its escrow refunded. This cannot be undone.`)) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/tasks/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success("Task deleted.");
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete task");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            All Tasks
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tasks.length} tasks · manage every task on the platform
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTasks}>
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading tasks...
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground gap-3">
          <FileText className="h-10 w-10 text-muted-foreground/30" />
          <p>No tasks on the platform yet.</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-border/40">
            {tasks.map((task: Task) => {
              const meta = getTaskType(task.type);
              return (
                <div key={task.id} className="flex items-center gap-4 p-4">
                  <div className={cn("shrink-0 rounded-lg p-2.5", meta?.bgColor ?? "bg-muted")}>
                    {meta ? (
                      <meta.icon className={cn("h-4 w-4", meta.color)} />
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      by {task.publisher?.name ?? "Unknown"} · {task.publisher?.email ?? ""}
                      {task.order?.worker && ` · worker: ${task.order.worker}`}
                    </p>
                  </div>

                  <span className="text-sm font-semibold shrink-0">${n(task.budget).toFixed(0)}</span>

                  <Badge variant="outline" className={cn("text-xs shrink-0", STATUS_COLORS[task.status] ?? "")}>
                    {task.status}
                  </Badge>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      render={<Link href={`/dashboard/tasks/${task.id}`} />}
                      className="h-8 w-8 p-0"
                      title="View task"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteTask(task.id, task.title)}
                      disabled={deletingId === task.id}
                      className="h-8 w-8 p-0 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      title="Delete task"
                    >
                      {deletingId === task.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
