"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Wallet, TrendingUp, TrendingDown, Lock, ArrowUpRight,
  ArrowDownRight, Clock, CheckCircle2, RefreshCw, Loader2,
  CreditCard, Zap, ShieldCheck, DollarSign,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const n = (v: unknown) => Number(v ?? 0);
type TxType = "charge" | "refund" | "escrow" | "earning" | "deposit";

interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  description: string;
  taskTitle: string;
  agentName: string;
  date: string;
  status: string;
}

interface WalletData {
  balance: number;
  frozenBalance: number;
  totalBalance: number;
  totalSpent: number;
  totalEarned: number;
  transactions: Transaction[];
}

// ─── Tx type config ───────────────────────────────────────────────────────────
const txConfig: Record<TxType, { label: string; icon: React.ReactNode; color: string; sign: string }> = {
  charge: {
    label: "Payment",
    icon: <ArrowUpRight className="h-4 w-4" />,
    color: "text-rose-400",
    sign: "-",
  },
  refund: {
    label: "Refund",
    icon: <ArrowDownRight className="h-4 w-4" />,
    color: "text-emerald-400",
    sign: "+",
  },
  escrow: {
    label: "In Escrow",
    icon: <Lock className="h-4 w-4" />,
    color: "text-amber-400",
    sign: "-",
  },
  earning: {
    label: "Earnings",
    icon: <Zap className="h-4 w-4" />,
    color: "text-violet-400",
    sign: "+",
  },
  deposit: {
    label: "Deposit",
    icon: <ArrowDownRight className="h-4 w-4" />,
    color: "text-emerald-400",
    sign: "+",
  },
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon, gradient,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  gradient: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className={cn("absolute inset-0 opacity-5", gradient)} />
      <CardContent className="pt-6 pb-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={cn("p-2 rounded-lg", gradient.replace("bg-gradient-to-br", "bg-opacity-15"))}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Transaction Row ──────────────────────────────────────────────────────────
function TxRow({ tx }: { tx: Transaction }) {
  const cfg = txConfig[tx.type];
  const isPositive = tx.type === "earning" || tx.type === "refund" || tx.type === "deposit";

  return (
    <div className="flex items-center gap-4 py-3 border-b border-border/40 last:border-0">
      <div className={cn(
        "h-9 w-9 shrink-0 rounded-full flex items-center justify-center",
        tx.type === "charge" ? "bg-rose-500/10" :
        tx.type === "escrow" ? "bg-amber-500/10" :
        tx.type === "earning" ? "bg-violet-500/10" :
        "bg-emerald-500/10"
      )}>
        <span className={cfg.color}>{cfg.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{tx.taskTitle}</p>
        <p className="text-xs text-muted-foreground">
          {cfg.label} · {tx.agentName}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={cn("text-sm font-semibold", isPositive ? "text-emerald-400" : "text-foreground")}>
          {isPositive ? "+" : "−"}${Math.abs(tx.amount).toFixed(2)}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(tx.date).toLocaleDateString()}
        </p>
      </div>
      <Badge
        variant="outline"
        className={cn(
          "text-xs shrink-0 capitalize",
          tx.status === "completed" ? "text-emerald-400 border-emerald-500/30" :
          tx.status === "executing" || tx.status === "review" ? "text-amber-400 border-amber-500/30" :
          "text-muted-foreground"
        )}
      >
        {tx.status === "completed" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
        {tx.status}
      </Badge>
    </div>
  );
}

// ─── Main Wallet Page ─────────────────────────────────────────────────────────
export default function WalletPage() {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TxType | "all">("all");

  const fetchWallet = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wallet/me");
      const json = await res.json();
      setData(json);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchWallet(); }, []);

  const filteredTx = data?.transactions.filter(
    (tx) => filter === "all" || tx.type === filter
  ) ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading wallet...
      </div>
    );
  }

  const bal = n(data?.balance);
  const frozen = n(data?.frozenBalance);
  const total = n(data?.totalBalance);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            Wallet
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your balance, track spending and earnings
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchWallet}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
          <Button size="sm" className="glow-sm" disabled>
            <CreditCard className="h-4 w-4 mr-1.5" />
            Add Funds (Stripe)
          </Button>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="sm:col-span-2 relative overflow-hidden border-primary/20">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-violet-500/5" />
          <CardContent className="pt-6 pb-5">
            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">
              Available Balance
            </p>
            <p className="text-4xl font-bold text-primary">${bal.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground mt-2">
              ${frozen.toFixed(2)} in escrow · ${total.toFixed(2)} total
            </p>
            <div className="mt-4 h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: total > 0 ? `${(bal / total) * 100}%` : "100%" }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Available</span>
              <span>Frozen · ${frozen.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        <StatCard
          label="Total Spent"
          value={`$${n(data?.totalSpent).toFixed(2)}`}
          sub="As publisher"
          icon={<TrendingUp className="h-5 w-5 text-rose-400" />}
          gradient="bg-gradient-to-br from-rose-500 to-orange-500"
        />
        <StatCard
          label="Total Earned"
          value={`$${n(data?.totalEarned).toFixed(2)}`}
          sub="As agent owner"
          icon={<TrendingDown className="h-5 w-5 text-violet-400" />}
          gradient="bg-gradient-to-br from-violet-500 to-blue-500"
        />
      </div>

      {/* Mock Stripe strip */}
      <Card className="border-dashed border-primary/30 bg-primary/3">
        <CardContent className="py-4 flex items-center gap-4">
          <ShieldCheck className="h-8 w-8 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Connect Stripe for real payments</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Currently using mock balance. Set <code className="text-primary">STRIPE_SECRET_KEY</code> to go live.
            </p>
          </div>
          <Button variant="outline" size="sm" disabled className="shrink-0">
            <DollarSign className="h-4 w-4 mr-1" />
            Connect Stripe
          </Button>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>{filteredTx.length} transactions</CardDescription>
            </div>
            {/* Filter chips */}
            <div className="flex flex-wrap gap-1.5">
              {(["all", "charge", "escrow", "earning", "refund"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "text-xs px-3 py-1 rounded-full border transition-colors",
                    filter === f
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border/50 text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTx.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Wallet className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No transactions yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-transparent">
              {filteredTx.map((tx) => (
                <TxRow key={tx.id} tx={tx} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
