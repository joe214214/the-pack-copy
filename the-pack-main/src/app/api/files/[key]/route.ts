/**
 * GET /api/files/[key] — Serve a stored file
 *
 * Reads the file from storage and returns it with the correct Content-Type.
 * The [key] parameter is the full storage key (URL-encoded).
 */
import { NextRequest, NextResponse } from "next/server";
import { readFile, StorageError } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

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

    // Return with correct Content-Type and cache headers
    return new NextResponse(new Uint8Array(content), {
      status: 200,
      headers: {
        "Content-Type": fileRecord.contentType,
        "Content-Length": String(content.length),
        "Content-Disposition": `inline; filename="${fileRecord.filename}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    if (error instanceof StorageError && error.code === "NOT_FOUND") {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    console.error("[GET /api/files/[key]]", error);
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 });
  }
}
