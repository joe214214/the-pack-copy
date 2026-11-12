/**
 * GET /api/files/[key] — Serve a stored file
 *
 * Script-capable types (HTML/SVG/JS) are read and returned under a sandbox
 * CSP; everything else is a 302 to a short-lived signed storage URL.
 * The [key] parameter is the full storage key (URL-encoded).
 */
import { NextRequest, NextResponse } from "next/server";
import { readFile, getSignedDownloadUrl, StorageError } from "@/lib/storage";
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

    // Inert types: redirect to a short-lived signed storage URL instead of
    // proxying. A proxied response is capped at ~4.5 MB on Vercel, so large
    // images/PDFs (and future video) would fail; this also keeps the bytes
    // off our function bandwidth. Script-capable types are still proxied
    // below so they get the sandbox CSP.
    if (!ACTIVE_TYPES.has(fileRecord.contentType)) {
      const signed = await getSignedDownloadUrl(decodedKey, 300);
      return NextResponse.redirect(signed, {
        status: 302,
        // A little under the URL's lifetime so a cached redirect never points at an expired URL.
        headers: { "Cache-Control": "private, max-age=240" },
      });
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
