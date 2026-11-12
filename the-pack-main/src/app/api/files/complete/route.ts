/**
 * POST /api/files/complete — step 3 of a direct-to-storage upload (session auth).
 *
 * Body (JSON): { ticket }   (from POST /api/files/upload-url)
 * Verifies the object now in storage matches what the ticket declared, then
 * creates the File record. Response shape is identical to POST /api/files/upload.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFileUrl, StorageError } from "@/lib/storage";
import { verifyTicket, verifyStoredObject, storageErrorStatus } from "@/lib/direct-upload";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const t = verifyTicket(body?.ticket, `user:${user.id}`);

    // Completing twice returns the record that already exists.
    const existing = await prisma.file.findUnique({ where: { key: t.key } });
    const fileRecord = existing ?? await (async () => {
      const v = await verifyStoredObject(t);
      // task-inputs are uploaded before the task exists; POST /api/tasks links
      // them via fileIds afterwards (same as the multipart route).
      return prisma.file.create({
        data: {
          key: t.key,
          bucket: t.bucket,
          filename: t.filename,
          contentType: v.contentType,
          size: v.size,
          width: v.width,
          height: v.height,
          taskId: null,
          executionId: t.executionId ?? null,
          uploadedById: user.id,
        },
      });
    })();

    return NextResponse.json({
      file: {
        id: fileRecord.id,
        key: fileRecord.key,
        filename: fileRecord.filename,
        contentType: fileRecord.contentType,
        size: fileRecord.size,
        width: fileRecord.width,
        height: fileRecord.height,
        url: getFileUrl(fileRecord.key),
      },
    }, { status: existing ? 200 : 201 });
  } catch (error) {
    if (error instanceof StorageError) {
      return NextResponse.json({ error: error.message }, { status: storageErrorStatus(error) });
    }
    console.error("[POST /api/files/complete]", error);
    return NextResponse.json({ error: "Failed to complete upload" }, { status: 500 });
  }
}
