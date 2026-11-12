/**
 * POST /api/agent-gateway/files/upload-url — step 1 of a direct-to-storage
 * agent upload (Bearer agent key). For deliverables of any size up to the
 * bucket limit; the multipart /files/upload route still works for small ones.
 *
 * Body (JSON): { executionId, filename, contentType?, size }
 * Returns:     { signedUrl, contentType, ticket }
 *
 * Then PUT the raw bytes to `signedUrl` with `Content-Type: <contentType>`
 * (use the returned value — it may be normalised from the filename) and call
 * POST /api/agent-gateway/files/complete { ticket }.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { createUploadTarget, detectContentType, StorageError } from "@/lib/storage";
import { signTicket, normalizeAgentContentType, storageErrorStatus } from "@/lib/direct-upload";

export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;
  const { agent } = auth;

  try {
    const body = await request.json().catch(() => null);
    const executionId = typeof body?.executionId === "string" ? body.executionId : "";
    const filename = typeof body?.filename === "string" ? body.filename : "";
    const size = Number(body?.size);
    if (!executionId) return NextResponse.json({ error: "Missing 'executionId'" }, { status: 400 });
    if (!filename) return NextResponse.json({ error: "Missing 'filename'" }, { status: 400 });
    if (!Number.isInteger(size) || size <= 0) {
      return NextResponse.json({ error: "Missing or invalid 'size'" }, { status: 400 });
    }

    const execution = await prisma.execution.findUnique({
      where: { id: executionId },
      include: { order: { select: { agentId: true } } },
    });
    if (!execution) return NextResponse.json({ error: "Execution not found" }, { status: 404 });
    if (execution.order.agentId !== agent.id) {
      return NextResponse.json({ error: "Unauthorized for this execution" }, { status: 403 });
    }
    if (execution.status !== "PENDING" && execution.status !== "RUNNING") {
      return NextResponse.json({ error: `Execution already ${execution.status}` }, { status: 400 });
    }

    const declared = (typeof body?.contentType === "string" && body.contentType) || detectContentType(filename);
    const contentType = normalizeAgentContentType(filename, declared);

    const target = await createUploadTarget("task-outputs", executionId, filename, contentType, size);
    const ticket = signTicket({
      key: target.key, bucket: "task-outputs", filename, contentType, size,
      owner: `agent:${agent.id}`, executionId,
    });
    return NextResponse.json({ signedUrl: target.signedUrl, contentType, ticket });
  } catch (error) {
    if (error instanceof StorageError) {
      return NextResponse.json({ error: error.message }, { status: storageErrorStatus(error) });
    }
    console.error("[POST /api/agent-gateway/files/upload-url]", error);
    return NextResponse.json({ error: "Failed to prepare upload" }, { status: 500 });
  }
}
