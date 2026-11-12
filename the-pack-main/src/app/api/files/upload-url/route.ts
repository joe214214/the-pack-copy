/**
 * POST /api/files/upload-url — step 1 of a direct-to-storage upload (session auth).
 *
 * Body (JSON): { bucket, contextId, filename, contentType?, size }
 * Returns:     { signedUrl, contentType, ticket }
 *
 * The browser then PUTs the raw file to `signedUrl` with header
 * `Content-Type: <contentType>` and calls POST /api/files/complete { ticket }.
 * Bytes never pass through this app, so files above Vercel's ~4.5 MB request
 * limit work. See src/lib/direct-upload.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createUploadTarget, detectContentType, StorageError, STORAGE_BUCKETS, type StorageBucket,
} from "@/lib/storage";
import { signTicket, storageErrorStatus } from "@/lib/direct-upload";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const bucket = body?.bucket as StorageBucket | undefined;
    const contextId = typeof body?.contextId === "string" ? body.contextId : "";
    const filename = typeof body?.filename === "string" ? body.filename : "";
    const size = Number(body?.size);

    if (!bucket || !STORAGE_BUCKETS.includes(bucket)) {
      return NextResponse.json({ error: "Invalid or missing 'bucket'" }, { status: 400 });
    }
    if (!contextId) return NextResponse.json({ error: "Missing 'contextId'" }, { status: 400 });
    if (!filename) return NextResponse.json({ error: "Missing 'filename'" }, { status: 400 });
    if (!Number.isInteger(size) || size <= 0) {
      return NextResponse.json({ error: "Missing or invalid 'size'" }, { status: 400 });
    }
    const contentType = (typeof body?.contentType === "string" && body.contentType) || detectContentType(filename);

    // Same rule as the multipart route: an output file must name a real execution.
    let executionId: string | null = null;
    if (bucket === "task-outputs") {
      const execution = await prisma.execution.findUnique({ where: { id: contextId }, select: { id: true } });
      if (!execution) {
        return NextResponse.json({ error: "Execution not found for contextId" }, { status: 404 });
      }
      executionId = execution.id;
    }

    const target = await createUploadTarget(bucket, contextId, filename, contentType, size);
    const ticket = signTicket({
      key: target.key, bucket, filename, contentType, size,
      owner: `user:${user.id}`, executionId,
    });
    return NextResponse.json({ signedUrl: target.signedUrl, contentType, ticket });
  } catch (error) {
    if (error instanceof StorageError) {
      return NextResponse.json({ error: error.message }, { status: storageErrorStatus(error) });
    }
    console.error("[POST /api/files/upload-url]", error);
    return NextResponse.json({ error: "Failed to prepare upload" }, { status: 500 });
  }
}
