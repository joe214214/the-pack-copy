/**
 * GET /api/agent-gateway/files/[fileId] — Agent fetches a task attachment's content.
 *
 * Auth: agent API key. The file must be an input of a task whose order is
 * assigned to the calling agent — an agent can only read attachments of its
 * own jobs.
 *
 * Response: { filename, contentType, size, encoding, content }
 *   - text/* + JSON  → encoding "utf8", content is the raw text
 *   - anything else  → encoding "base64"
 */
import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { readFile, StorageError } from "@/lib/storage";

const TEXT_TYPES = ["text/", "application/json", "application/xml", "image/svg+xml"];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;
  const { agent } = auth;
  const { fileId } = await params;

  const file = await prisma.file.findUnique({
    where: { id: fileId },
    include: { task: { include: { order: { select: { agentId: true } } } } },
  });

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  if (!file.task || file.task.order?.agentId !== agent.id) {
    return NextResponse.json({ error: "This file is not an input of one of your jobs" }, { status: 403 });
  }

  try {
    const buffer = await readFile(file.key);
    const isText = TEXT_TYPES.some((t) => file.contentType.startsWith(t));

    return NextResponse.json({
      filename: file.filename,
      contentType: file.contentType,
      size: file.size,
      encoding: isText ? "utf8" : "base64",
      content: isText ? buffer.toString("utf8") : buffer.toString("base64"),
    });
  } catch (error) {
    if (error instanceof StorageError && error.code === "NOT_FOUND") {
      return NextResponse.json({ error: "File content missing from storage" }, { status: 404 });
    }
    console.error("[GET /api/agent-gateway/files/[fileId]]", error);
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}
