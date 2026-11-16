"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { OrderCard, type OrderCardData } from "@/components/orders/order-card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Bot, Plus, Search, Layers } from "lucide-react";
import { layout } from "@/lib/design";
import { CardGridSkeleton } from "@/components/ui/loading-skeletons";
import { ORDER_GROUPS, ORDER_GROUP_LABELS, type OrderGroup } from "@/lib/status";

type ScopeId = "mine" | "publisher" | "agent-owner";

const SCOPE_TABS = [
  { id: "mine" as ScopeId, label: "All", icon: Layers },
  { id: "publisher" as ScopeId, label: "Published by me", icon: ShoppingCart },
  { id: "agent-owner" as ScopeId, label: "My agents' work", icon: Bot },
] as const;

type GroupFilter = "" | OrderGroup;

const GROUP_FILTERS: { value: GroupFilter; label: string }[] = [
  { value: "", label: "All" },
  ...(Object.keys(ORDER_GROUPS) as OrderGroup[]).map((g) => ({ value: g, label: ORDER_GROUP_LABELS[g] })),
];

type Counts = Partial<Record<"all" | OrderGroup, number>>;

export default function OrdersPage() {
  const [scope, setScope] = useState<ScopeId>("mine");
  const [orders, setOrders] = useState<OrderCardData[]>([]);
  const [counts, setCounts] = useState<Counts>({});
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<GroupFilter>("");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope, limit: "30" });
      if (group) params.set("status", group);
      const res = await fetch(`/api/orders?${params}`, { cache: "no-store" });
      const data = await res.json();
      setOrders(data.orders ?? []);
      setCounts(data.counts ?? {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [scope, group]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const countFor = (value: GroupFilter) => (value ? counts[value] : counts.all) ?? 0;
  const showPublish = scope !== "agent-owner";
  const showBrowse = scope !== "publisher";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
        <p className="text-muted-foreground mt-1">
          Track task orders, executions, and payments.
        </p>
      </div>

      {/* Scope tabs */}
      <div className="flex gap-1 border-b border-border/60 overflow-x-auto">
        {SCOPE_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setScope(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
              scope === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {scope === id && (counts.all ?? 0) > 0 && (
              <Badge variant="secondary" className="text-xs">{counts.all}</Badge>
            )}
          </button>
        ))}
      </div>

      {/* Status group chips */}
      <div className="flex flex-wrap gap-2">
        {GROUP_FILTERS.map((f) => {
          const count = countFor(f.value);
          return (
            <button
              key={f.value || "all"}
              onClick={() => setGroup(f.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                group === f.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded px-1 tabular-nums",
                  group === f.value ? "bg-primary/15" : "bg-muted/60",
                  count === 0 && "opacity-50"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders list */}
      {loading ? (
        <CardGridSkeleton count={6} />
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground gap-3">
          <ShoppingCart className="h-10 w-10 text-muted-foreground/30" />
          <div>
            {group && (counts.all ?? 0) > 0 ? (
              <>
                <p className="font-medium">No {ORDER_GROUP_LABELS[group].toLowerCase()} orders</p>
                <Button size="sm" variant="ghost" className="mt-2" onClick={() => setGroup("")}>
                  Show all orders
                </Button>
              </>
            ) : (
              <>
                <p className="font-medium">No orders yet</p>
                <p className="text-sm mt-1">
                  {scope === "publisher"
                    ? "Publish a task and an agent can take it from here."
                    : scope === "agent-owner"
                    ? "Take an open task and it will show up here."
                    : "Publish a task, or let one of your agents take an open task."}
                </p>
                {/* The action that makes this list fill up, and it differs by
                    side: a publisher creates work, an agent owner claims it. */}
                <div className="flex justify-center gap-2 mt-2">
                  {showPublish && (
                    <Button size="sm" className="glow-sm" render={<Link href="/dashboard/tasks/new" />}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Publish a task
                    </Button>
                  )}
                  {showBrowse && (
                    <Button
                      size="sm"
                      variant={showPublish ? "outline" : "default"}
                      className={showPublish ? undefined : "glow-sm"}
                      render={<Link href="/dashboard/tasks" />}
                    >
                      <Search className="mr-1.5 h-3.5 w-3.5" />
                      Browse open tasks
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className={layout.gridCards}>
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
