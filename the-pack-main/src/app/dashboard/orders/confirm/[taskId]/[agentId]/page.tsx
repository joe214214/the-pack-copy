"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditTierBadge } from "@/components/agents/credit-tier-badge";
import { getTaskType } from "@/lib/task-types";
import { calculateFees } from "@/lib/fees";
import {
  ArrowLeft, Bot, CheckCircle2, Clock, DollarSign,
  Loader2, ShieldCheck, Star, Zap, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

const n = (v: unknown) => Number(v ?? 0);

export default function OrderConfirmPage() {
  const { taskId, agentId } = useParams<{ taskId: string; agentId: string }>();
  const router = useRouter();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [task, setTask] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [agent, setAgent] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [publisherBalance, setPublisherBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [taskRes, agentRes] = await Promise.all([
          fetch(`/api/tasks/${taskId}`),
          fetch(`/api/agents/${agentId}?byId=1`),
        ]);
        const taskData = await taskRes.json();
        const agentData = await agentRes.json();
        setTask(taskData.task);
        setAgent(agentData.agent);

        // Fetch publisher balance (using seed publisher)
        const balRes = await fetch(`/api/users/balance?userId=${taskData.task?.publisherId}`);
        if (balRes.ok) {
          const balData = await balRes.json();
          setPublisherBalance(balData.available ?? 0);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (taskId && agentId) load();
  }, [taskId, agentId]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, agentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to place order");
      toast.success("Order placed! Agent will start soon.");
      router.push(`/dashboard/orders/${data.order.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading confirmation...
      </div>
    );
  }

  if (!task || !agent) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p>Task or agent not found.</p>
        <Button render={<Link href="/dashboard/tasks" />} variant="ghost" className="mt-4">
          Back to Tasks
        </Button>
      </div>
    );
  }

  const taskMeta = getTaskType(task.type);
  const price = n(task.budget);
  const { platformFee, agentPayout, escrowAmount } = calculateFees(price);
  const canAfford = publisherBalance >= escrowAmount;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button render={<Link href={`/dashboard/tasks/${taskId}`} />} variant="ghost" size="sm">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Task
      </Button>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Confirm Order</h1>
        <p className="text-muted-foreground mt-1">
          Review everything before placing your order.
        </p>
      </div>

      {/* Task summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {taskMeta && <taskMeta.icon className={cn("h-4 w-4", taskMeta.color)} />}
            Task
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="font-semibold">{task.title}</p>
          {taskMeta && <p className={cn("text-xs", taskMeta.color)}>{taskMeta.label}</p>}
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{task.description}</p>
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {n(task.deadlineHours)}h deadline
            </span>
            {task.outputFormat && (
              <span className="text-foreground/60">Output: {task.outputFormat}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Agent summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            Selected Agent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold">{agent.name}</p>
                <CreditTierBadge tier={agent.creditTier} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{agent.modelInfo}</p>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 text-amber-400">
                  <Star className="h-3 w-3 fill-amber-400" />
                  {n(agent.avgRating).toFixed(1)}
                </span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  {Math.round(n(agent.successRate) * 100)}% success
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  ~{Math.round(n(agent.avgDurationSecs) / 60)}m avg
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment breakdown */}
      <Card className={cn(!canAfford && "border-rose-500/40")}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-400" />
            Payment Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Task budget (escrow)</span>
              <span className="font-medium">${price.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Platform fee (10%)</span>
              <span>−${platformFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-border/50 pt-2 text-emerald-400 font-medium">
              <span>Agent receives</span>
              <span>${agentPayout.toFixed(2)}</span>
            </div>
          </div>

          {/* Balance check */}
          <div className={cn(
            "rounded-lg border p-3 text-xs",
            canAfford
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-rose-500/30 bg-rose-500/5"
          )}>
            <div className="flex items-center gap-2">
              {canAfford ? (
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              )}
              <div>
                <p className={cn("font-medium", canAfford ? "text-emerald-400" : "text-rose-400")}>
                  {canAfford ? "Sufficient balance" : "Insufficient balance"}
                </p>
                <p className="text-muted-foreground mt-0.5">
                  Your balance: ${publisherBalance.toFixed(2)} available
                  {!canAfford && ` — need $${(escrowAmount - publisherBalance).toFixed(2)} more`}
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Funds are held in escrow and released upon successful delivery and acceptance.
          </p>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          render={<Link href={`/dashboard/tasks/${taskId}`} />}
          className="flex-1"
          disabled={submitting}
        >
          Go Back
        </Button>
        <Button
          className="flex-1 glow"
          onClick={handleConfirm}
          disabled={!canAfford || submitting || task.status !== "OPEN"}
        >
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Zap className="mr-2 h-4 w-4" />
          )}
          {task.status !== "OPEN" ? "Task no longer available" : `Place Order · $${escrowAmount.toFixed(2)}`}
        </Button>
      </div>
    </div>
  );
}
