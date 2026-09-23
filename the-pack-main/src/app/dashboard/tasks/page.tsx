"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TaskCard } from "@/components/tasks/task-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TASK_TYPES } from "@/lib/task-types";
import { cn } from "@/lib/utils";
import {
  Plus,
  Search,
  Loader2,
  FileText,
  Globe,
} from "lucide-react";
import { layout } from "@/lib/design";

type TabId = "open" | "mine";

interface Task {
  id: string;
  title: string;
  type: string;
  description: string;
  budget: number;
  deadlineHours: number;
  status: string;
  createdAt: string;
  publisher?: { name: string } | null;
}

export default function TasksPage() {
  const [tab, setTab] = useState<TabId>("open");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("");

  useEffect(() => {
    const fetchTasks = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ scope: tab, limit: "20" });
        if (selectedType) params.set("type", selectedType);
        const res = await fetch(`/api/tasks?${params}`);
        const data = await res.json();
        setTasks(data.tasks ?? []);
        setTotal(data.total ?? 0);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, [tab, selectedType]);

  // Client-side search filter
  const filtered = tasks.filter(
    (t) =>
      !search ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground mt-1">
            Browse open tasks or publish your own.
          </p>
        </div>
        <Button
          render={<Link href="/dashboard/tasks/new" />}
          className="glow-sm shrink-0"
        >
          <Plus className="mr-2 h-4 w-4" />
          Publish Task
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/60">
        {(
          [
            { id: "open" as TabId, label: "Marketplace", icon: Globe },
            { id: "mine" as TabId, label: "My Tasks", icon: FileText },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {tab === id && total > 0 && (
              <Badge variant="secondary" className="text-xs">
                {total}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Search + filters */}
      {/* The search box gets a fixed width instead of flex-1. Sharing the row
          with ten wrapping filter buttons, flex-1 gave it no minimum and it
          collapsed to just the magnifier icon. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="relative w-full sm:w-72 sm:shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap sm:flex-1">
          <button
            onClick={() => setSelectedType("")}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              !selectedType
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/30"
            )}
          >
            All Types
          </button>
          {TASK_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() =>
                setSelectedType(selectedType === type.id ? "" : type.id)
              }
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                selectedType === type.id
                  ? cn("border-primary text-primary", type.bgColor)
                  : "border-border text-muted-foreground hover:border-primary/30"
              )}
            >
              <type.icon className={cn("h-3 w-3", selectedType === type.id ? type.color : "")} />
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading tasks...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground gap-3">
          <FileText className="h-10 w-10 text-muted-foreground/30" />
          <div>
            <p className="font-medium">No tasks found</p>
            <p className="text-sm mt-1">
              {tab === "mine"
                ? "You haven't published any tasks yet."
                : "No open tasks match your filters."}
            </p>
          </div>
          {tab === "mine" && (
            <Button
              render={<Link href="/dashboard/tasks/new" />}
              size="sm"
              className="mt-2 glow-sm"
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Publish your first task
            </Button>
          )}
        </div>
      ) : (
        <div className={layout.gridCards}>
          {filtered.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
