"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, CheckCheck, XCircle, Star, FileText, Bot,
  Loader2, ShieldCheck, AlertTriangle, CheckCircle2, Clock,
  Download, Eye, Zap,
} from "lucide-react";
import { toast } from "sonner";

const n = (v: unknown) => Number(v ?? 0);

interface AutoCheck {
  check: string;
  passed: boolean;
  details: string;
  weight: number;
}

// ─── Star Rating Component ───────────────────────────────────────────────────
function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="transition-transform hover:scale-110"
        >
          <Star
            className={cn(
              "h-7 w-7 transition-colors",
              (hovered || value) >= star
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/30"
            )}
          />
        </button>
      ))}
    </div>
  );
}

// ─── Auto-check display ──────────────────────────────────────────────────────
function AutoCheckRow({ check }: { check: AutoCheck }) {
  const label = check.check
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <div className="flex items-center gap-3 py-2">
      <div className={cn("shrink-0 rounded-full p-1", check.passed ? "bg-emerald-500/15" : "bg-rose-500/15")}>
        {check.passed ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <XCircle className="h-4 w-4 text-rose-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{check.details}</p>
      </div>
      <Badge variant="outline" className="text-xs shrink-0">
        ×{check.weight.toFixed(1)}
      </Badge>
    </div>
  );
}

// ─── Output Viewer ───────────────────────────────────────────────────────────
function OutputViewer({ file }: { file: { name: string; url: string; size: number; type: string } }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loadContent = async () => {
    if (content !== null) { setExpanded(!expanded); return; }
    setLoading(true);
    try {
      const res = await fetch(file.url);
      setContent(await res.text());
      setExpanded(true);
    } catch { setContent("Failed to load file content."); }
    finally { setLoading(false); }
  };

  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-3 p-3">
        <FileText className="h-4 w-4 text-blue-400 shrink-0" />
        <span className="text-sm font-medium flex-1">{file.name}</span>
        <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={loadContent} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" render={<a href={file.url} download={file.name} />}>
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {expanded && content !== null && (
        <div className="border-t border-border/50 p-4 bg-muted/20">
          <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Main Review Page ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrderDetail = any;

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch(`/api/orders/${id}`);
        const data = await res.json();
        setOrder(data.order);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    if (id) fetch_();
  }, [id]);

  const handleSubmit = async (accepted: boolean) => {
    if (accepted && rating === 0) {
      toast.error("Please rate the delivery before accepting.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/reviews/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted, rating: rating || undefined, comment: comment || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(accepted ? "✓ Delivery accepted! Agent paid." : "⚠ Dispute raised. Admin will review.");
      router.push(`/dashboard/orders/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading review...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>Order not found.</p>
        <Button render={<Link href="/dashboard/orders" />} variant="ghost" className="mt-4">Back</Button>
      </div>
    );
  }

  if (order.status !== "REVIEW") {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p className="font-medium">Order is not in review state.</p>
        <p className="text-sm mt-1">Current status: <strong>{order.status}</strong></p>
        <Button render={<Link href={`/dashboard/orders/${id}`} />} variant="ghost" className="mt-4">
          Back to Order
        </Button>
      </div>
    );
  }

  const review = order.review;
  const execution = order.execution;
  const autoScore = n(review?.autoScore);
  const autoChecks: AutoCheck[] = review?.autoChecks ?? [];
  const outputFiles: Array<{ name: string; url: string; size: number; type: string }> =
    execution?.outputFiles ?? [];
  const deadline = new Date(order.deadline);
  const isOnTime = execution?.completedAt ? new Date(execution.completedAt) <= deadline : true;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Button render={<Link href={`/dashboard/orders/${id}`} />} variant="ghost" size="sm">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Order
      </Button>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <Badge variant="outline" className="text-amber-400 bg-amber-500/10 border-amber-500/30 gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            In Review
          </Badge>
          {isOnTime ? (
            <Badge variant="outline" className="text-emerald-400 bg-emerald-500/10 border-emerald-500/30 gap-1">
              <Clock className="h-3 w-3" /> On time
            </Badge>
          ) : (
            <Badge variant="outline" className="text-rose-400 bg-rose-500/10 border-rose-500/30 gap-1">
              <Clock className="h-3 w-3" /> Late delivery
            </Badge>
          )}
        </div>
        <h1 className="text-2xl font-bold">{order.task?.title}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Delivered by <strong>{order.agent?.name}</strong> · Review and rate the output below
        </p>
      </div>

      {/* Main 2-col layout */}
      <div className="grid gap-6 lg:grid-cols-5">

        {/* Left — output viewer (wider) */}
        <div className="lg:col-span-3 space-y-5">

          {/* Task brief */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">
                Original Task Brief
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-foreground/80">{order.task?.description}</p>
              {order.task?.outputFormat && (
                <p className="text-xs text-muted-foreground mt-2">
                  Expected format: {order.task.outputFormat}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Deliverables */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-400" />
                Deliverables
              </CardTitle>
              <CardDescription>{outputFiles.length} file(s) delivered</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {outputFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No output files available.</p>
              ) : (
                outputFiles.map((file) => (
                  <OutputViewer key={file.name} file={file} />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right — auto-review + rating */}
        <div className="lg:col-span-2 space-y-5">

          {/* Auto-review score */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Auto Quality Check
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Score gauge */}
              <div className="flex items-center gap-4">
                <div className={cn(
                  "text-3xl font-bold",
                  autoScore >= 0.8 ? "text-emerald-400" :
                  autoScore >= 0.6 ? "text-amber-400" : "text-rose-400"
                )}>
                  {(autoScore * 100).toFixed(0)}%
                </div>
                <div>
                  <div className={cn(
                    "text-sm font-medium",
                    review?.autoPassed ? "text-emerald-400" : "text-rose-400"
                  )}>
                    {review?.autoPassed ? "✓ Auto-check passed" : "✗ Auto-check failed"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {autoChecks.filter((c: AutoCheck) => c.passed).length}/{autoChecks.length} checks passed
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    autoScore >= 0.8 ? "bg-emerald-400" :
                    autoScore >= 0.6 ? "bg-amber-400" : "bg-rose-400"
                  )}
                  style={{ width: `${autoScore * 100}%` }}
                />
              </div>

              {/* Per-check breakdown */}
              <div className="divide-y divide-border/40">
                {autoChecks.map((check: AutoCheck) => (
                  <AutoCheckRow key={check.check} check={check} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Agent info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">
                Agent
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">{order.agent?.name}</p>
                <Button
                  variant="link"
                  size="sm"
                  render={<Link href={`/dashboard/agents/${order.agent?.slug}`} />}
                  className="h-auto p-0 text-xs text-primary"
                >
                  View profile <Zap className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* User rating & decision */}
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-400" />
                Your Review
              </CardTitle>
              <CardDescription>
                Rate the delivery and decide whether to accept or dispute.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="text-sm font-medium mb-2">
                  Rating <span className="text-rose-400">*</span>
                </p>
                <StarInput value={rating} onChange={setRating} />
                {rating > 0 && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {["", "Poor", "Fair", "Good", "Great", "Excellent"][rating]}
                  </p>
                )}
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Comment (optional)</p>
                <Textarea
                  placeholder="What did you think of the delivery? Any feedback for the agent?"
                  value={comment}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setComment(e.target.value)}
                  rows={3}
                  className="resize-none text-sm"
                />
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  className="w-full glow"
                  onClick={() => handleSubmit(true)}
                  disabled={submitting || rating === 0}
                >
                  {submitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCheck className="mr-2 h-4 w-4" />
                  )}
                  Accept & Pay Agent · ${n(order.price) - (n(order.price) * 0.10)}/deliverable
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                  onClick={() => handleSubmit(false)}
                  disabled={submitting}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Dispute — Request Refund
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Accepting releases held funds to the agent.
                Disputes are reviewed by the ThePack team within 24h.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
