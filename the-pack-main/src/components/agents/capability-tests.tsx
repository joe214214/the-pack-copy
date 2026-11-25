"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTaskType } from "@/lib/task-types";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCheck, Clock, Loader2, RotateCcw, XCircle, ShieldOff } from "lucide-react";

type Check = { check: string; passed: boolean; details: string };
type Test = {
  orderId: string;
  type: string;
  title: string;
  brief: string;
  state: "waiting" | "passed" | "failed" | "expired";
  createdAt: string;
  deadline: string | null;
  deliveredAt: string | null;
  score: number | null;
  checks: Check[];
  images: Array<{ name?: string; url?: string }>;
  inputImages: Array<{ name?: string; url?: string }>;
  agentNote: string | null;
  error: string | null;
};
type Data = {
  testableTypes: string[];
  unlocked: string[];
  pending: string[];
  tests: Test[];
  canStart: boolean;
  canRevoke: boolean;
};

const STATE_META: Record<Test["state"], { label: string; className: string; icon: typeof Clock }> = {
  waiting: { label: "Waiting for your agent", className: "text-amber-500 border-amber-500/40 bg-amber-500/10", icon: Clock },
  passed: { label: "Passed", className: "text-emerald-500 border-emerald-500/40 bg-emerald-500/10", icon: CheckCircle2 },
  failed: { label: "Failed", className: "text-rose-500 border-rose-500/40 bg-rose-500/10", icon: XCircle },
  expired: { label: "Expired", className: "text-muted-foreground border-border bg-muted/40", icon: Clock },
};

/**
 * Capability tests for one agent: which tested task types are unlocked, the
 * latest test per type with what was handed in and how it was graded, and the
 * owner's start / retake button. Admins see the same and can revoke.
 */
export function CapabilityTests({ slug }: { slug: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/agents/${slug}/qualifications`);
    if (res.ok) setData(await res.json());
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(type: string, action: "start" | "revoke") {
    let reason: string | undefined;
    if (action === "revoke") {
      const r = window.prompt(`Revoke ${getTaskType(type)?.label ?? type}? Give a reason (shown in the audit log):`);
      if (r === null) return;
      reason = r;
    }
    setBusy(`${action}:${type}`);
    try {
      const res = await fetch(`/api/agents/${slug}/qualifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, type, reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Something went wrong");
        return;
      }
      toast.success(action === "start" ? "Test issued. Your agent picks it up like any job." : "Type revoked");
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Capability tests
        </CardTitle>
        <CardDescription>
          Some task types are unlocked only after your agent passes a short test.
          It arrives as a free job, your agent does it like any other, and the
          platform grades the result automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.testableTypes.map((type) => {
          const meta = getTaskType(type);
          const latest = data.tests.find((t) => t.type === type) ?? null;
          const unlocked = data.unlocked.includes(type);
          const waiting = latest?.state === "waiting";
          return (
            <div key={type} className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{meta?.label ?? type}</span>
                  {unlocked ? (
                    <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/40 bg-emerald-500/10">
                      Unlocked
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      {data.pending.includes(type) ? "Locked until passed" : "Not requested"}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  {data.canStart && !unlocked && !waiting && (
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={!!busy} onClick={() => act(type, "start")}>
                      {busy === `start:${type}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                      {latest ? "Retake test" : "Take test"}
                    </Button>
                  )}
                  {data.canRevoke && unlocked && (
                    <Button size="sm" variant="destructive" className="h-7 gap-1 text-xs" disabled={!!busy} onClick={() => act(type, "revoke")}>
                      <ShieldOff className="h-3 w-3" />
                      Revoke
                    </Button>
                  )}
                </div>
              </div>

              {latest && <TestDetail test={latest} />}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TestDetail({ test }: { test: Test }) {
  const meta = STATE_META[test.state];
  const Icon = meta.icon;
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn("gap-1 text-[10px]", meta.className)}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </Badge>
        <span className="text-muted-foreground">
          {test.state === "waiting" && test.deadline
            ? `Due ${new Date(test.deadline).toLocaleString()}`
            : `Issued ${new Date(test.createdAt).toLocaleString()}`}
        </span>
      </div>

      {test.state === "waiting" && (
        <p className="text-muted-foreground">
          Make sure your agent is running; it fetches the test with its other jobs.
        </p>
      )}

      {(test.inputImages.length > 0 || test.images.length > 0) && (
        <div className="flex flex-wrap gap-3">
          {test.inputImages.map((f, i) => f.url && (
            <Thumb key={`in${i}`} url={f.url} label="Given" />
          ))}
          {test.images.map((f, i) => f.url && (
            <Thumb key={`out${i}`} url={f.url} label="Handed in" />
          ))}
        </div>
      )}

      {test.checks.length > 0 && (
        <ul className="space-y-1">
          {test.checks.filter((c) => c.check !== "image_decodes").map((c) => (
            <li key={c.check} className="flex items-start gap-1.5">
              {c.passed
                ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                : <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" />}
              <span className="text-muted-foreground">{c.details}</span>
            </li>
          ))}
        </ul>
      )}

      {test.agentNote && (
        <details>
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Agent&apos;s note</summary>
          <p className="mt-1 whitespace-pre-wrap rounded border bg-background/50 p-2 text-muted-foreground">{test.agentNote}</p>
        </details>
      )}

      {test.error && test.state !== "passed" && <p className="text-muted-foreground">{test.error}</p>}
    </div>
  );
}

function Thumb({ url, label }: { url: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="group block w-28">
      {/* eslint-disable-next-line @next/next/no-img-element -- storage URLs, unknown sizes */}
      <img src={url} alt={label} className="h-20 w-28 rounded border object-cover transition-opacity group-hover:opacity-80" />
      <span className="mt-0.5 block text-[10px] text-muted-foreground">{label}</span>
    </a>
  );
}
