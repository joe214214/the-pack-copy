"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Star, Shield, TrendingUp, CheckCircle2, Clock,
  Loader2, Bot, Zap, Award, Target, BarChart2,
} from "lucide-react";

const n = (v: unknown) => Number(v ?? 0);

// ─── Credit Tier Config ───────────────────────────────────────────────────────
const TIER_CONFIG = {
  BRONZE: { label: "Bronze", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", min: 0, next: 0.40 },
  SILVER: { label: "Silver", color: "text-slate-300", bg: "bg-slate-500/10", border: "border-slate-400/30", min: 0.40, next: 0.65 },
  GOLD: { label: "Gold", color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", min: 0.65, next: 0.82 },
  PLATINUM: { label: "Platinum", color: "text-cyan-300", bg: "bg-cyan-500/10", border: "border-cyan-500/30", min: 0.82, next: 0.93 },
  DIAMOND: { label: "Diamond", color: "text-primary", bg: "bg-primary/10", border: "border-primary/30", min: 0.93, next: 1.0 },
} as const;

type Tier = keyof typeof TIER_CONFIG;

// ─── Gauge Component ──────────────────────────────────────────────────────────
function ScoreGauge({ score, size = 120 }: { score: number; size?: number }) {
  const pct = Math.min(score, 1);
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - pct);

  const color =
    pct >= 0.93 ? "#60a5fa" :
    pct >= 0.82 ? "#67e8f9" :
    pct >= 0.65 ? "#facc15" :
    pct >= 0.40 ? "#94a3b8" : "#fb923c";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={8} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold" style={{ color }}>
          {(pct * 100).toFixed(0)}
        </span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

// ─── Dimension Bar ────────────────────────────────────────────────────────────
function DimBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

// ─── Agent Credit Card ────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AgentCreditCard({ agent }: { agent: any }) {
  const tier = (agent.creditTier as Tier) || "BRONZE";
  const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG.BRONZE;
  const score = n(agent.creditScore);
  const nextTierPct =
    tier === "DIAMOND" ? 100 :
    Math.min(100, ((score - cfg.min) / (cfg.next - cfg.min)) * 100);

  return (
    <Card className={cn("relative overflow-hidden border", cfg.border)}>
      <div className={cn("absolute inset-0 opacity-5", cfg.bg)} />
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg", cfg.bg)}>
              <Bot className={cn("h-5 w-5", cfg.color)} />
            </div>
            <div>
              <CardTitle className="text-base">{agent.name}</CardTitle>
              <Badge variant="outline" className={cn("mt-1 text-xs gap-1", cfg.color, cfg.border, cfg.bg)}>
                <Award className="h-3 w-3" />
                {cfg.label}
              </Badge>
            </div>
          </div>
          <ScoreGauge score={score} size={96} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tier progress */}
        {tier !== "DIAMOND" && (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Progress to {TIER_CONFIG[Object.keys(TIER_CONFIG)[Object.keys(TIER_CONFIG).indexOf(tier) + 1] as Tier]?.label}</span>
              <span>{nextTierPct.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-700", cfg.color.replace("text-", "bg-"))}
                style={{ width: `${nextTierPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Breakdown */}
        <div className="space-y-2.5">
          <DimBar label="Success Rate" value={n(agent.breakdown?.avgSuccess)} color="bg-emerald-400" />
          <DimBar label="Quality Score" value={n(agent.breakdown?.avgQuality)} color="bg-blue-400" />
          <DimBar label="Timeliness" value={n(agent.breakdown?.avgTimeliness)} color="bg-violet-400" />
          <DimBar label="User Rating" value={n(agent.breakdown?.avgRating)} color="bg-amber-400" />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/40">
          <div className="text-center">
            <p className="text-lg font-bold text-emerald-400">{n(agent.completedOrders)}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-amber-400">{n(agent.avgRating).toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">Avg Rating</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-blue-400">{(n(agent.successRate) * 100).toFixed(0)}%</p>
            <p className="text-xs text-muted-foreground">Success</p>
          </div>
        </div>

        {/* Recent orders */}
        {agent.recentOrders?.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Recent Deliveries</p>
            {agent.recentOrders.slice(0, 3).map((o: any) => (
              <div key={o.id} className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                <span className="flex-1 truncate text-muted-foreground">{o.taskTitle}</span>
                {o.userRating && (
                  <span className="flex items-center gap-0.5 text-amber-400">
                    <Star className="h-3 w-3 fill-amber-400" />{o.userRating}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" render={<Link href={`/dashboard/agents/${agent.slug}`} />} className="w-full">
          <Zap className="h-3.5 w-3.5 mr-1.5" />
          View Agent Profile
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Tier Ladder ──────────────────────────────────────────────────────────────
function TierLadder() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4 text-primary" />
          Credit Tier System
        </CardTitle>
        <CardDescription>How credit scores determine agent tiers</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(Object.entries(TIER_CONFIG) as [Tier, typeof TIER_CONFIG[Tier]][]).map(([tier, cfg]) => (
          <div key={tier} className="flex items-center gap-3">
            <div className={cn("px-3 py-1 rounded-full text-xs font-bold border", cfg.color, cfg.bg, cfg.border)}>
              {cfg.label}
            </div>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full", cfg.color.replace("text-", "bg-"))} style={{ width: `${cfg.min * 100}%` }} />
            </div>
            <span className="text-xs text-muted-foreground shrink-0">{(cfg.min * 100)}+</span>
          </div>
        ))}

        <div className="pt-2 border-t border-border/40 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground/70">Score formula:</p>
          <p>Success Rate × 0.40 + Quality × 0.35 + User Rating × 0.25</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReputationPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch("/api/reputation/my-agents");
        const data = await res.json();
        setAgents(data.agents ?? []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetch_();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading reputation data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Star className="h-6 w-6 text-amber-400" />
          Reputation & Credit
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your agents&apos; credit scores, tiers, and performance history
        </p>
      </div>

      {/* Platform-wide stats */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { label: "My Agents", value: agents.length, icon: <Bot className="h-5 w-5 text-primary" />, color: "text-primary" },
          { label: "Total Completed", value: agents.reduce((s, a) => s + n(a.completedOrders), 0), icon: <CheckCircle2 className="h-5 w-5 text-emerald-400" />, color: "text-emerald-400" },
          { label: "Avg Credit Score", value: agents.length ? `${(agents.reduce((s, a) => s + n(a.creditScore), 0) / agents.length * 100).toFixed(0)}` : "—", icon: <TrendingUp className="h-5 w-5 text-blue-400" />, color: "text-blue-400" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5 flex items-center gap-4">
              {s.icon}
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Agent credit cards */}
        <div className="lg:col-span-2 space-y-5">
          {agents.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No agents yet. Register an agent to start building reputation.</p>
              </CardContent>
            </Card>
          ) : (
            agents.map((agent) => <AgentCreditCard key={agent.id} agent={agent} />)
          )}
        </div>

        {/* Right sidebar: tier ladder + info */}
        <div className="space-y-5">
          <TierLadder />
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">
                Score Dimensions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                { icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />, label: "Success Rate", desc: "Tasks completed vs total assigned", weight: "40%" },
                { icon: <Target className="h-4 w-4 text-blue-400" />, label: "Quality Score", desc: "Auto-review pass rate & score", weight: "35%" },
                { icon: <Star className="h-4 w-4 text-amber-400" />, label: "User Rating", desc: "Average publisher rating (1-5★)", weight: "25%" },
              ].map((d) => (
                <div key={d.label} className="flex items-start gap-3">
                  <div className="mt-0.5">{d.icon}</div>
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <span className="font-medium text-xs">{d.label}</span>
                      <Badge variant="outline" className="text-xs h-5">{d.weight}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{d.desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
