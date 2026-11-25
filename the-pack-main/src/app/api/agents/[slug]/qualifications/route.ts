/**
 * Capability tests of one agent.
 *
 * GET  — owner or admin: which types are pending / unlocked, and every test
 *        with its grading and the images that were handed in.
 * POST { action: "start", type }            — owner: issue (or retake) a test.
 * POST { action: "revoke", type, reason }   — admin: take an unlocked type back.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { revokeTaskType } from "@/lib/orders/lifecycle";
import { lifecycleErrorResponse } from "@/lib/orders/http";
import { QUALIFIED_TYPES, needsQualification } from "@/lib/qualification/spec";
import { startQualification } from "@/lib/qualification/service";

type OutputFile = { name?: string; type?: string; url?: string };

/**
 * Stored file URLs are absolute, with whatever NEXT_PUBLIC_APP_URL the writing
 * server had (a local dev port, a preview deployment). Serve them relative so
 * they load on whichever host is showing the page.
 */
function relativeFileUrl(f: OutputFile): OutputFile {
  const i = f.url?.indexOf("/api/files/") ?? -1;
  return i > 0 ? { ...f, url: f.url!.slice(i) } : f;
}

/** The agent's own note travels as an inline output.md data URL. */
function noteFrom(files: OutputFile[]): string | null {
  const md = files.find((f) => f.name === "output.md" && f.url?.startsWith("data:"));
  if (!md?.url) return null;
  const b64 = md.url.slice(md.url.indexOf("base64,") + 7);
  try {
    return Buffer.from(b64, "base64").toString("utf8").slice(0, 2000);
  } catch {
    return null;
  }
}

async function loadAgent(slug: string) {
  return prisma.agent.findUnique({
    where: { slug },
    select: { id: true, ownerId: true, supportedTaskTypes: true, pendingTaskTypes: true },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  const agent = await loadAgent(slug);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  if (agent.ownerId !== user.id && !user.isAdmin) {
    return NextResponse.json({ error: "Not your agent" }, { status: 403 });
  }

  const orders = await prisma.order.findMany({
    where: { agentId: agent.id, task: { isQualification: true } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      status: true,
      createdAt: true,
      deadline: true,
      deliveredAt: true,
      task: { select: { type: true, title: true, description: true, inputFiles: true } },
      execution: { select: { status: true, outputFiles: true, errorMessage: true } },
      review: { select: { autoPassed: true, autoScore: true, autoChecks: true } },
    },
  });

  const tests = orders.map((o) => {
    const files = (Array.isArray(o.execution?.outputFiles) ? o.execution.outputFiles : []) as OutputFile[];
    const state =
      o.status === "EXECUTING" ? "waiting"
      : o.status === "SETTLED" ? "passed"
      : o.execution?.status === "TIMEOUT" ? "expired"
      : "failed";
    return {
      orderId: o.id,
      type: o.task.type,
      title: o.task.title,
      brief: o.task.description,
      state,
      createdAt: o.createdAt,
      deadline: o.deadline,
      deliveredAt: o.deliveredAt,
      score: o.review ? Number(o.review.autoScore) : null,
      checks: o.review?.autoChecks ?? [],
      images: files.filter((f) => f.type?.startsWith("image/")).map((f) => relativeFileUrl({ name: f.name, url: f.url })),
      inputImages: ((Array.isArray(o.task.inputFiles) ? o.task.inputFiles : []) as OutputFile[]).map(relativeFileUrl),
      agentNote: noteFrom(files),
      error: o.execution?.errorMessage ?? null,
    };
  });

  return NextResponse.json(
    {
      testableTypes: QUALIFIED_TYPES,
      unlocked: agent.supportedTaskTypes.filter(needsQualification),
      pending: agent.pendingTaskTypes,
      tests,
      canStart: agent.ownerId === user.id,
      canRevoke: !!user.isAdmin,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  const agent = await loadAgent(slug);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  let body: { action?: unknown; type?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const type = typeof body.type === "string" ? body.type : "";
  if (!needsQualification(type)) {
    return NextResponse.json({ error: `'${type}' has no capability test` }, { status: 400 });
  }

  try {
    if (body.action === "start") {
      if (agent.ownerId !== user.id) {
        return NextResponse.json({ error: "Not your agent" }, { status: 403 });
      }
      if (agent.supportedTaskTypes.includes(type)) {
        return NextResponse.json({ error: "This agent already has this type" }, { status: 409 });
      }
      // Lets an existing agent add a tested type later, not only at registration.
      if (!agent.pendingTaskTypes.includes(type)) {
        await prisma.agent.update({
          where: { id: agent.id },
          data: { pendingTaskTypes: [...agent.pendingTaskTypes, type] },
        });
      }
      const opened = await startQualification({ agentId: agent.id, type, actorId: user.id });
      return NextResponse.json({ started: true, orderId: opened.orderId }, { status: 201 });
    }

    if (body.action === "revoke") {
      if (!user.isAdmin) return NextResponse.json({ error: "Admins only" }, { status: 403 });
      const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : "Revoked by admin";
      await revokeTaskType({ agentId: agent.id, type, adminId: user.id, reason });
      return NextResponse.json({ revoked: true });
    }
  } catch (e) {
    return lifecycleErrorResponse(e, "POST /api/agents/[slug]/qualifications");
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
