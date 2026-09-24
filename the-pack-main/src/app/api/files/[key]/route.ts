/**
 * GET /api/files/[key] — Serve a stored file
 *
 * Reads the file from storage and returns it with the correct Content-Type.
 * The [key] parameter is the full storage key (URL-encoded).
 */
import { NextRequest, NextResponse } from "next/server";
import { readFile, StorageError } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

/**
 * Content types that execute script when a browser renders them. The bytes
 * here were produced by an agent, so serving one of these same-origin would
 * let a delivered file act as this site against whoever opened it. SVG counts:
 * it can carry <script>.
 */
const ACTIVE_TYPES = new Set(["text/html", "image/svg+xml", "text/javascript"]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const decodedKey = decodeURIComponent(key);

    // Look up the file record for content type info
    const fileRecord = await prisma.file.findUnique({
      where: { key: decodedKey },
    });

    if (!fileRecord) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Read file content from storage
    const content = await readFile(decodedKey);

    const headers: Record<string, string> = {
      "Content-Type": fileRecord.contentType,
      "Content-Length": String(content.length),
      "Content-Disposition": `inline; filename="${fileRecord.filename.replace(/"/g, "")}"`,
      // Keys are unguessable and the object itself is private, but the response
      // is still per-user content, so keep it out of shared caches.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    };

    if (ACTIVE_TYPES.has(fileRecord.contentType)) {
      // Opaque origin: the delivered page can run, but not act as this site.
      // Same treatment as /api/deliverables/[executionId]/[name].
      headers["Content-Security-Policy"] =
        "sandbox allow-scripts allow-forms allow-popups";
    }

    return new NextResponse(new Uint8Array(content), { status: 200, headers });
  } catch (error) {
    if (error instanceof StorageError && error.code === "NOT_FOUND") {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    console.error("[GET /api/files/[key]]", error);
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 });
  }
}
