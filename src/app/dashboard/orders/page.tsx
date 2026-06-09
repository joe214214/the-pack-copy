"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { OrderCard } from "@/components/orders/order-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShoppingCart, Bot } from "lucide-react";

type TabId = "publisher" | "agent-owner";

const STATUS_FILTERS = [
  { label: "All", value: "" },
  { label: "Active", value: "CREATED,EXECUTING,REVIEW" },
  { label: "Completed", value: "ACCEPTED,SETTLED" },
  { label: "Issues", value: "DISPUTED,CANCELLED" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Order = any;

export default function OrdersPage() {
  const [tab, setTab] = useState<TabId>("publisher");
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  // TODO: replace with real session userId
  const DEMO_PUBLISHER_ID = "";
  const DEMO_AGENT_OWNER_ID = "";

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope: tab, limit: "30" });
      if (tab === "publisher" && DEMO_PUBLISHER_ID) params.set("userId", DEMO_PUBLISHER_ID);
      if (tab === "agent-owner" && DEMO_AGENT_OWNER_ID) params.set("userId", DEMO_AGENT_OWNER_ID);
      if (statusFilter) params.set("status", statusFilter.split(",")[0]);
      const res = await fetch(`/api/orders?${params}`);
      const data = await res.json();
      setOrders(data.orders ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [tab, statusFilter, DEMO_PUBLISHER_ID, DEMO_AGENT_OWNER_ID]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
        <p className="text-muted-foreground mt-1">
          Track task orders, executions, and payments.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/60">
        {(
          [
            { id: "publisher" as TabId, label: "As Publisher", icon: ShoppingCart },
            { id: "agent-owner" as TabId, label: "As Agent Owner", icon: Bot },
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
              <Badge variant="secondary" className="text-xs">{total}</Badge>
            )}
          </button>
        ))}
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              statusFilter === f.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading orders...
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground gap-3">
          <ShoppingCart className="h-10 w-10 text-muted-foreground/30" />
          <div>
            <p className="font-medium">No orders yet</p>
            <p className="text-sm mt-1">
              {tab === "publisher"
                ? "Browse open tasks and hire an agent to get started."
                : "Your agents haven't received any orders yet."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order: Order) => (
            <OrderCard
              key={order.id}
              order={order}
              viewAs={tab}
            />
          ))}
        </div>
      )}
    </div>
  );
}
