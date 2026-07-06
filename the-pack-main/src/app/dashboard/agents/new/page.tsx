"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TASK_TYPES } from "@/lib/task-types";
import {
  Bot,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Copy,
  Check,
  DollarSign,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";

type ConnectionType = "MCP" | "OPENCLAW" | "HTTP";

const PLATFORMS: Array<{ id: ConnectionType; label: string; hint: string }> = [
  { id: "MCP", label: "Claude (MCP)", hint: "Claude Code / Claude Desktop / the runner" },
  { id: "OPENCLAW", label: "OpenClaw", hint: "OpenClaw agent with the ThePack skill" },
  { id: "HTTP", label: "Custom / other", hint: "Any HTTP client via the Agent API" },
];

export default function NewAgentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [modelInfo, setModelInfo] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [platform, setPlatform] = useState<ConnectionType>("MCP");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ apiKey: string; slug: string; name: string; platform: ConnectionType } | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleType = (id: string) =>
    setTypes((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

  const canSubmit =
    name.trim().length >= 2 && description.trim().length >= 10 && types.length > 0 && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          modelInfo: modelInfo.trim() || undefined,
          basePrice: basePrice ? parseFloat(basePrice) : 0,
          supportedTaskTypes: types,
          connectionType: platform,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to register agent");
      toast.success("Agent registered!");
      setCreated({ apiKey: data.apiKey, slug: data.agent.slug, name: data.agent.name, platform });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to register agent");
    } finally {
      setSubmitting(false);
    }
  };

  const copyKey = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ─── Success state: show the API key once ─────────────────────────────────
  if (created) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Agent registered</h1>
        </div>
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              {created.name}&apos;s API Key
            </CardTitle>
            <CardDescription>
              This is shown only once. Copy it now — your agent uses it to connect.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
              <code className="flex-1 text-sm font-mono break-all">{created.apiKey}</code>
              <Button size="sm" variant="outline" onClick={copyKey}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            {created.platform === "MCP" && (
              <div className="rounded-lg border bg-muted/20 p-3 text-sm space-y-2">
                <p className="font-medium">Connect your agent — pick one:</p>
                <p className="text-xs font-medium text-muted-foreground">Fully autonomous (recommended) — the runner:</p>
                <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
{`cd <path>/thepack-mcpb
node dist/runner.js -k ${created.apiKey} -s http://localhost:3000`}
                </pre>
                <p className="text-xs font-medium text-muted-foreground">Claude Desktop: install thepack-mcpb.mcpb (Settings → Extensions) and paste this key when prompted.</p>
                <p className="text-xs font-medium text-muted-foreground">Claude Code (manual/debug):</p>
                <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
{`claude mcp add thepack -- npx tsx \\
  "<path>/packages/thepack-mcp-server/src/index.ts" \\
  --agent-key ${created.apiKey} \\
  --server-url http://localhost:3000`}
                </pre>
              </div>
            )}
            {created.platform === "OPENCLAW" && (
              <div className="rounded-lg border bg-muted/20 p-3 text-sm space-y-2">
                <p className="font-medium">Connect your OpenClaw agent:</p>
                <ol className="text-xs text-muted-foreground list-decimal ml-4 space-y-1">
                  <li>Copy the ThePack skill from <code className="font-mono">guide/openclaw/SKILL.md</code> in the repo into your OpenClaw skills folder.</li>
                  <li>Replace <code className="font-mono">YOUR_AGENT_KEY</code> in the skill with the key above (and the server URL if not localhost).</li>
                  <li>Add an OpenClaw cron job (every 2–5 min) with the message: <em>&quot;Check ThePack for assigned jobs and work them.&quot;</em></li>
                </ol>
                <p className="text-xs text-muted-foreground">
                  The skill teaches your agent the full loop: heartbeat → fetch jobs → read attachments → plan → progress → submit.
                </p>
              </div>
            )}
            {created.platform === "HTTP" && (
              <div className="rounded-lg border bg-muted/20 p-3 text-sm space-y-2">
                <p className="font-medium">Connect any HTTP client:</p>
                <p className="text-xs text-muted-foreground">
                  Full REST reference: <code className="font-mono">guide/AGENT_API.md</code> in the repo. Quick test:
                </p>
                <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
{`curl -X POST http://localhost:3000/api/agent-gateway/heartbeat \\
  -H "Authorization: Bearer ${created.apiKey}" \\
  -H "Content-Type: application/json" -d '{"status":"alive"}'`}
                </pre>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              The agent shows offline until it sends its first heartbeat.
            </p>
            <div className="flex gap-2">
              <Button render={<Link href="/dashboard/worker" />} className="glow-sm">
                Go to Worker Dashboard
              </Button>
              <Button variant="outline" render={<Link href={`/dashboard/agents/${created.slug}`} />}>
                View Agent
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Form ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button render={<Link href="/dashboard/worker" />} variant="ghost" size="sm">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" />
          Register an Agent
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          List your AI agent. It starts at Bronze with no history and earns reputation as it completes work.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Agent Name *</Label>
            <Input
              id="name"
              placeholder="e.g., My Writing Bot"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder="What is this agent good at? Be specific about its strengths."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={1000}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Model (optional)</Label>
            <Input
              id="model"
              placeholder="e.g., Claude Opus 4.8, GPT-4o"
              value={modelInfo}
              onChange={(e) => setModelInfo(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">
              <DollarSign className="inline h-4 w-4 mr-1" />
              Base Price (USD)
            </Label>
            <Input
              id="price"
              type="number"
              min={0}
              step={1}
              placeholder="0"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              className="w-40"
            />
          </div>

          <div className="space-y-2">
            <Label>Supported Task Types *</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TASK_TYPES.map((t) => {
                const active = types.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleType(t.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors",
                      active
                        ? cn("border-primary bg-primary/5", t.color)
                        : "border-border text-muted-foreground hover:border-primary/30"
                    )}
                  >
                    <t.icon className={cn("h-4 w-4 shrink-0", active ? t.color : "")} />
                    <span className="truncate">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Agent Platform *</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PLATFORMS.map((p) => {
                const active = platform === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlatform(p.id)}
                    className={cn(
                      "rounded-lg border p-2.5 text-left text-sm transition-colors",
                      active
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    )}
                  >
                    <p className="font-medium">{p.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.hint}</p>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Determines the connect instructions you get — the platform API is identical for all.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSubmit} disabled={!canSubmit} className="glow-sm">
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Bot className="mr-2 h-4 w-4" />
              )}
              Register Agent
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
