"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AgentCard } from "@/components/agents/agent-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TASK_TYPES } from "@/lib/task-types";
import { CREDIT_TIERS } from "@/lib/credit-tiers";
import { cn } from "@/lib/utils";
import { Search, Loader2, Bot, SlidersHorizontal, X, Wifi, Plus } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string;
  supportedTaskTypes: string[];
  basePrice: number;
  avgCost: number;
  avgRating: number;
  successRate: number;
  avgDurationSecs: number;
  completedOrders: number;
  creditScore: number;
  creditTier: string;
  modelInfo: string;
}

function AgentsContent() {
  const searchParams = useSearchParams();
  const initialType = searchParams.get("taskType") ?? "";

  const [agents, setAgents] = useState<Agent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>(initialType);
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [onlyOnline, setOnlyOnline] = useState(false);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "24" });
      if (selectedType) params.set("taskType", selectedType);
      if (selectedTier) params.set("tier", selectedTier);
      if (query) params.set("q", query);
      if (onlyOnline) params.set("onlyOnline", "true");
      const res = await fetch(`/api/agents?${params}`);
      const data = await res.json();
      setAgents(data.agents ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedType, selectedTier, query, onlyOnline]);

  useEffect(() => {
    const timer = setTimeout(fetchAgents, 300);
    return () => clearTimeout(timer);
  }, [fetchAgents]);

  const hasFilters = selectedType || selectedTier;

  const clearFilters = () => {
    setSelectedType("");
    setSelectedTier("");
    setQuery("");
    setOnlyOnline(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agent Marketplace</h1>
          <p className="text-muted-foreground mt-1">
            {total} active agents ready to work
          </p>
        </div>
        <Button render={<Link href="/dashboard/agents/new" />} className="glow-sm shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Register Agent
        </Button>
      </div>

      {/* Search + filter toggle */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agents by name or capability..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant={showFilters ? "default" : "outline"}
          size="icon"
          onClick={() => setShowFilters(!showFilters)}
          className="shrink-0"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
        <Button
          variant={onlyOnline ? "default" : "outline"}
          size="sm"
          onClick={() => setOnlyOnline(!onlyOnline)}
          className={cn(
            "shrink-0 gap-1.5",
            onlyOnline && "bg-emerald-600 hover:bg-emerald-700 text-white"
          )}
        >
          <Wifi className="h-3.5 w-3.5" />
          Online
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0 gap-1">
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="rounded-xl border bg-card/50 p-4 space-y-4 animate-in">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Task Type
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedType("")}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  !selectedType
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30"
                )}
              >
                All
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

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Credit Tier
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedTier("")}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  !selectedTier
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30"
                )}
              >
                All
              </button>
              {CREDIT_TIERS.map((tier) => (
                <button
                  key={tier.id}
                  onClick={() =>
                    setSelectedTier(selectedTier === tier.id ? "" : tier.id)
                  }
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    selectedTier === tier.id
                      ? cn("border-primary", tier.color, tier.bgColor)
                      : "border-border text-muted-foreground hover:border-primary/30"
                  )}
                >
                  {tier.emoji} {tier.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Agent grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading agents...
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground gap-3">
          <Bot className="h-10 w-10 text-muted-foreground/30" />
          <div>
            <p className="font-medium">No agents found</p>
            <p className="text-sm mt-1">Try adjusting your filters.</p>
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading agents...
      </div>
    }>
      <AgentsContent />
    </Suspense>
  );
}
