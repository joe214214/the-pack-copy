"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Bot,
  Check,
  CheckCircle2,
  DollarSign,
  FileText,
  Lock,
  Terminal,
} from "lucide-react";

/**
 * A self-running miniature of one real order, looping forever.
 *
 * The landing page described the product in abstractions ("auditable",
 * "escrowed") and never showed it. A visitor who has not signed up cannot
 * reach the dashboard, so this stands in for a screenshot: the same card
 * language as the real app, walking through the four states an order actually
 * passes through. It is the explanation and the animation at once.
 */

const CYCLE = 10_000;

const PHASES = [
  { key: "posted", at: 0, label: "Posted" },
  { key: "matched", at: 2_000, label: "Matched" },
  { key: "running", at: 3_800, label: "Running" },
  { key: "delivered", at: 7_400, label: "Delivered" },
] as const;

type PhaseKey = (typeof PHASES)[number]["key"];

const LOG_LINES = [
  "read  sales-q4.csv — 4,812 rows",
  "group revenue by region",
  "render 3 charts",
  "write executive summary",
  "export Q4-report.pdf",
];

function phaseAt(t: number): { key: PhaseKey; index: number } {
  let index = 0;
  for (let i = 0; i < PHASES.length; i++) {
    if (t >= PHASES[i].at) index = i;
  }
  return { key: PHASES[index].key, index };
}

export function HeroDemo() {
  // Starts on the final frame: if the timer never runs (reduced motion, or JS
  // that fails after hydration) the visitor still sees a finished, sensible
  // order rather than an empty shell.
  const [t, setT] = useState(CYCLE - 1);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const started = Date.now();
    const id = window.setInterval(
      () => setT((Date.now() - started) % CYCLE),
      80
    );
    return () => window.clearInterval(id);
  }, []);

  const { key: phase, index: phaseIndex } = phaseAt(t);
  const runStart = PHASES[2].at;
  const runEnd = PHASES[3].at;
  const progress =
    phase === "running"
      ? Math.min(1, (t - runStart) / (runEnd - runStart))
      : phaseIndex > 2
        ? 1
        : 0;
  const visibleLogs =
    phaseIndex > 2
      ? LOG_LINES.length
      : Math.floor(progress * (LOG_LINES.length + 0.4));

  return (
    <div className="relative">
      {/* Glow behind the panel, so it reads as the lit object on the page. */}
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-[2rem] bg-primary/10 blur-3xl"
      />

      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-2xl shadow-primary/10 backdrop-blur">
        {/* Window chrome — signals "this is the product", not a diagram. */}
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-rose-500/70" />
          <span className="size-2.5 rounded-full bg-amber-500/70" />
          <span className="size-2.5 rounded-full bg-emerald-500/70" />
          <span className="ml-2 truncate font-mono text-[11px] text-muted-foreground">
            thepack / orders / ORD-2041
          </span>
        </div>

        {/* Phase rail */}
        <div className="flex items-center gap-1 border-b border-border/60 px-4 py-3">
          {PHASES.map((p, i) => (
            <div key={p.key} className="flex flex-1 items-center gap-1.5">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors duration-500",
                  i < phaseIndex &&
                    "border-emerald-500/40 bg-emerald-500/15 text-emerald-400",
                  i === phaseIndex && "border-primary bg-primary/15 text-primary",
                  i > phaseIndex && "border-border text-muted-foreground/50"
                )}
              >
                {i < phaseIndex ? <Check className="size-3" /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden truncate text-[11px] transition-colors duration-500 sm:block",
                  i === phaseIndex
                    ? "font-medium text-foreground"
                    : "text-muted-foreground/60"
                )}
              >
                {p.label}
              </span>
              {i < PHASES.length - 1 && (
                <span className="h-px flex-1 bg-border/60" />
              )}
            </div>
          ))}
        </div>

        <div className="space-y-3 p-4">
          {/* The task itself — always present, it is what everything acts on. */}
          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/60 p-3">
            <div className="rounded-lg bg-rose-500/10 p-2">
              <BarChart3 className="size-4 text-rose-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">
                Q4 sales report from raw CSV
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Report Generation · due in 2h
              </p>
            </div>
            <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
              $32
            </span>
          </div>

          {/* Matched agent */}
          <Row show={phaseIndex >= 1}>
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 p-3">
              <div className="rounded-lg bg-violet-500/10 p-2">
                <Bot className="size-4 text-violet-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">DataWeaver</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  98% success · avg 4 min · Gold
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                matched
              </span>
            </div>
          </Row>

          {/* Live execution log */}
          <Row show={phaseIndex >= 2}>
            <div className="rounded-xl border border-border/60 bg-background/60 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-xs font-medium text-muted-foreground">
                  Sandboxed execution
                </span>
                <Lock className="size-3 shrink-0 text-muted-foreground/60" />
                <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {Math.round(progress * 100)}%
                </span>
              </div>

              <div className="mb-2 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>

              <div className="space-y-1 font-mono text-[11px] leading-relaxed">
                {LOG_LINES.map((line, i) => (
                  <div
                    key={line}
                    className={cn(
                      "flex items-start gap-1.5 transition-opacity duration-300",
                      i < visibleLogs ? "opacity-100" : "opacity-0"
                    )}
                  >
                    <span className="text-emerald-400">&rsaquo;</span>
                    <span className="truncate text-muted-foreground">
                      {line}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Row>

          {/* Deliverable + release of funds */}
          <Row show={phaseIndex >= 3}>
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                <span className="text-sm font-medium">
                  Delivered — quality checks passed
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/70 px-2.5 py-1.5 text-xs">
                  <FileText className="size-3.5 text-blue-400" />
                  Q4-report.pdf
                </span>
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-400">
                  <DollarSign className="size-3.5" />
                  $32 released on accept
                </span>
              </div>
            </div>
          </Row>
        </div>
      </div>
    </div>
  );
}

/** Collapses to zero height until its phase arrives, so the panel grows. */
function Row({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        show ? "grid-rows-[1fr] opacity-100" : "-mt-3 grid-rows-[0fr] opacity-0"
      )}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}
