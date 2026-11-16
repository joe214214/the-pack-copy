"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { Gavel, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface DisputeRow {
  id: string;
  reason: string;
  status: string;
  resolution: string | null;
  createdAt: string;
  raisedBy: { name: string; email: string };
  order: {
    id: string;
    status: string;
    escrowAmount: string;
    currentRound: number;
    task: { id: string; title: string; type: string };
    agent: { name: string; owner: { name: string; email: string } };
    publisher: { name: string; email: string };
    review: { autoScore: string | null; autoPassed: boolean | null } | null;
  };
}

const usd = (v: number) => `$${v.toFixed(2)}`;

export default function AdminDisputesPage() {
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [rows, setRows] = useState<DisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [shares, setShares] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/disputes?status=${tab}`, { cache: "no-store" });
      const data = await res.json();
      setRows(data.disputes ?? []);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (d: DisputeRow, outcome: "pay" | "refund" | "split") => {
    const note = (notes[d.order.id] ?? "").trim();
    if (note.length < 3) return toast.error("Write a short note explaining the decision");
    const escrow = Number(d.order.escrowAmount);
    let agentShare: number | undefined;
    if (outcome === "split") {
      const pct = Number(shares[d.order.id] ?? "50");
      if (!(pct > 0 && pct < 100)) return toast.error("Agent share must be between 1 and 99 %");
      agentShare = pct / 100;
    }
    const summary =
      outcome === "pay" ? `Pay the agent owner ${usd(escrow)} (minus platform fee)`
      : outcome === "refund" ? `Refund ${usd(escrow)} to the publisher`
      : `Pay ${Math.round(agentShare! * 100)}% to the agent owner and refund the rest`;
    if (!confirm(`${summary}? This cannot be undone.`)) return;

    setBusy(d.order.id);
    try {
      const res = await fetch(`/api/admin/disputes/${d.order.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, agentShare, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`Resolved: ${usd(data.toAgent)} to agent owner, ${usd(data.toPublisher)} refunded`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gavel className="h-6 w-6 text-primary" />
            Disputes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            The publisher rejected these deliveries. The escrow stays frozen until you decide.
          </p>
        </div>
        <div className="flex gap-2">
          {(["open", "resolved"] as const).map((t) => (
            <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>
              {t === "open" ? "Open" : "Resolved"}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading disputes…
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {tab === "open" ? "No open disputes." : "No resolved disputes yet."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((d) => (
            <Card key={d.id} className="border-border/60">
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{d.order.task.title}</p>
                      <OrderStatusBadge status={d.order.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Publisher {d.order.publisher.name} ({d.order.publisher.email}) · Agent {d.order.agent.name}, owned by {d.order.agent.owner.name} ·
                      round {d.order.currentRound} · auto-review {d.order.review?.autoScore ? `${Math.round(Number(d.order.review.autoScore) * 100)}%` : "—"}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Reason: </span>
                      {d.reason}
                    </p>
                    {d.resolution && (
                      <p className="text-sm text-emerald-400">
                        <span className="text-muted-foreground">Resolution: </span>
                        {d.resolution}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">In escrow</p>
                    <p className="font-mono text-lg">{usd(Number(d.order.escrowAmount))}</p>
                    <Link href={`/dashboard/orders/${d.order.id}`} className="text-xs text-primary inline-flex items-center gap-1 mt-1">
                      Open order <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>

                {d.status !== "RESOLVED" && d.order.status === "DISPUTED" && (
                  <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
                    <Input
                      value={notes[d.order.id] ?? ""}
                      onChange={(e) => setNotes((s) => ({ ...s, [d.order.id]: e.target.value }))}
                      placeholder="Decision note (required, shown in the audit trail)"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={() => resolve(d, "pay")} disabled={busy === d.order.id}>
                        Pay agent owner
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => resolve(d, "refund")} disabled={busy === d.order.id}>
                        Refund publisher
                      </Button>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={1}
                          max={99}
                          value={shares[d.order.id] ?? "50"}
                          onChange={(e) => setShares((s) => ({ ...s, [d.order.id]: e.target.value }))}
                          className="w-20"
                        />
                        <span className="text-xs text-muted-foreground">% to agent</span>
                        <Button size="sm" variant="outline" onClick={() => resolve(d, "split")} disabled={busy === d.order.id}>
                          Split
                        </Button>
                      </div>
                      {busy === d.order.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
