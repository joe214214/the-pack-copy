"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Search, Users, Wallet, Unlock } from "lucide-react";
import { toast } from "sonner";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  balance: number;
  frozenBalance: number;
  escrowInOrders: number;
  unbackedEscrow: number;
  isBanned: boolean;
}

const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (query = "") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`, { cache: "no-store" });
      const data = await res.json();
      setUsers(data.users ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const send = async (userId: string, body: object, success: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(success);
      setOpen(null);
      setAmount("");
      setReason("");
      await load(q);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const adjust = (u: AdminUser) => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value === 0) return toast.error("Enter a non-zero amount (negative to debit)");
    if (reason.trim().length < 3) return toast.error("Give a reason (it is recorded in the ledger)");
    if (!confirm(`${value > 0 ? "Credit" : "Debit"} ${usd(Math.abs(value))} ${value > 0 ? "to" : "from"} ${u.email}?`)) return;
    send(u.id, { action: "adjust", amount: value, reason }, `${value > 0 ? "Credited" : "Debited"} ${usd(Math.abs(value))}`);
  };

  const release = (u: AdminUser) => {
    if (reason.trim().length < 3) return toast.error("Give a reason (it is recorded in the ledger)");
    if (!confirm(`Return ${usd(u.unbackedEscrow)} of unbacked frozen funds to ${u.email}'s available balance?`)) return;
    send(u.id, { action: "release_unbacked", reason }, `Released ${usd(u.unbackedEscrow)}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Users &amp; Balances
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Credit or debit balances and release stuck escrow. Every change is a ledger entry with your name and reason.
          </p>
        </div>
        <div className="flex gap-2">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              load(q);
            }}
          >
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Email or name" className="pl-8 w-56" />
          </form>
          <Button variant="outline" size="sm" onClick={() => load(q)}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading users…
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <Card key={u.id} className="border-border/60">
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {u.roles.map((r) => (
                        <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>
                      ))}
                      {u.isBanned && <Badge variant="destructive" className="text-[10px]">BANNED</Badge>}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-right text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Available</p>
                      <p className="font-mono">{usd(u.balance)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">In escrow</p>
                      <p className="font-mono">{usd(u.frozenBalance)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Unbacked</p>
                      <p className={u.unbackedEscrow > 0 ? "font-mono text-rose-400" : "font-mono text-muted-foreground"}>
                        {usd(u.unbackedEscrow)}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setOpen(open === u.id ? null : u.id)}>
                    <Wallet className="h-4 w-4 mr-1.5" /> Manage
                  </Button>
                </div>

                {open === u.id && (
                  <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-3">
                    <div className="grid gap-2 md:grid-cols-[140px_1fr]">
                      <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (+/−)" />
                      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required, stored in the ledger)" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => adjust(u)} disabled={busy}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                        Apply adjustment
                      </Button>
                      {u.unbackedEscrow > 0 && (
                        <Button size="sm" variant="outline" onClick={() => release(u)} disabled={busy} className="border-amber-500/40 text-amber-400">
                          <Unlock className="h-4 w-4 mr-1" /> Release {usd(u.unbackedEscrow)} unbacked escrow
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Escrow held by active orders: {usd(u.escrowInOrders)}. &quot;Unbacked&quot; is frozen money no active order accounts for —
                      left behind when old code deleted or settled orders without releasing it.
                    </p>
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
