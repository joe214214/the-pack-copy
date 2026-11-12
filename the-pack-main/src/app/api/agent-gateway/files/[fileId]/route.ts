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
import { readFile, getSignedDownloadUrl, StorageError } from "@/lib/storage";

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
    const params2 = new URL(request.url).searchParams;

    // ?signed=1 → JSON { url, filename, contentType, size } with a short-lived
    // direct storage URL. The agent then downloads WITHOUT our auth header and
    // without the bytes passing through this route (Vercel caps responses at
    // ~4.5 MB). Used by current thepack-mcpb get_input_file.
    if (params2.get("signed") === "1") {
      const url = await getSignedDownloadUrl(file.key, 600, file.filename);
      return NextResponse.json({
        url, filename: file.filename, contentType: file.contentType, size: file.size,
      });
    }

    const buffer = await readFile(file.key);

    // ?raw=1 → stream the raw bytes (older runners' get_input_file; still
    // works for files under the platform's response size limit).
    const raw = params2.get("raw") === "1";
    if (raw) {
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": file.contentType,
          "Content-Length": String(buffer.length),
          "Content-Disposition": `attachment; filename="${file.filename}"`,
        },
      });
    }

    // Default (back-compat): JSON with inline content.
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
