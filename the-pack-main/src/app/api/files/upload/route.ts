/**
 * POST /api/files/upload — Upload a file
 *
 * Accepts multipart/form-data with:
 *   - file: The file to upload (required)
 *   - bucket: Storage bucket ("task-inputs" | "task-outputs") (required)
 *   - contextId: Context identifier (taskId or executionId) (required)
 *
 * Returns the created File record with download URL.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  uploadFile,
  getFileUrl,
  isImageContentType,
  detectContentType,
  StorageError,
  type StorageBucket,
} from "@/lib/storage";

// Simple image dimension extraction from headers (no sharp dependency needed)
function getImageDimensions(buffer: Buffer, contentType: string): { width: number; height: number } | null {
  try {
    if (contentType === "image/png") {
      // PNG: width at offset 16, height at offset 20 (big-endian uint32)
      if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
        return {
          width: buffer.readUInt32BE(16),
          height: buffer.readUInt32BE(20),
        };
      }
    }

    if (contentType === "image/jpeg") {
      // JPEG: scan for SOF0 (0xFFC0) or SOF2 (0xFFC2) marker
      let offset = 2;
      while (offset < buffer.length - 9) {
        if (buffer[offset] === 0xFF) {
          const marker = buffer[offset + 1];
          if (marker === 0xC0 || marker === 0xC2) {
            return {
              height: buffer.readUInt16BE(offset + 5),
              width: buffer.readUInt16BE(offset + 7),
            };
          }
          const segmentLength = buffer.readUInt16BE(offset + 2);
          offset += 2 + segmentLength;
        } else {
          offset++;
        }
      }
    }

    if (contentType === "image/webp") {
      // WebP VP8: simple parsing for VP8 lossy
      if (buffer.length > 30 && buffer.slice(8, 12).toString() === "WEBP") {
        const vp8 = buffer.slice(12, 16).toString();
        if (vp8 === "VP8 " && buffer.length > 30) {
          return {
            width: buffer.readUInt16LE(26) & 0x3FFF,
            height: buffer.readUInt16LE(28) & 0x3FFF,
          };
        }
      }
    }

    if (contentType === "image/gif") {
      // GIF: width at offset 6, height at offset 8 (little-endian uint16)
      if (buffer.length >= 10) {
        return {
          width: buffer.readUInt16LE(6),
          height: buffer.readUInt16LE(8),
        };
      }
    }
  } catch {
    // Failed to parse dimensions — return null
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    // Auth: either session user or agent API key
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const bucket = formData.get("bucket") as StorageBucket | null;
    const contextId = formData.get("contextId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Missing 'file' in form data" }, { status: 400 });
    }
    if (!bucket || !["task-inputs", "task-outputs", "avatars"].includes(bucket)) {
      return NextResponse.json({ error: "Invalid or missing 'bucket'" }, { status: 400 });
    }
    if (!contextId) {
      return NextResponse.json({ error: "Missing 'contextId'" }, { status: 400 });
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = file.type || detectContentType(file.name);

    // Upload to storage
    const result = await uploadFile(bucket, contextId, file.name, buffer, contentType);

    // Extract image dimensions if applicable
    let width: number | null = null;
    let height: number | null = null;
    if (isImageContentType(contentType)) {
      const dims = getImageDimensions(buffer, contentType);
      if (dims) {
        width = dims.width;
        height = dims.height;
      }
    }

    // Create File record in database.
    // task-inputs are uploaded from the wizard BEFORE the task exists, so we
    // can't set taskId here (it would violate the FK) — POST /api/tasks links
    // the records via `fileIds` after the task is created. contextId is only
    // used to namespace the storage key.
    let executionId: string | null = null;
    if (bucket === "task-outputs") {
      const execution = await prisma.execution.findUnique({ where: { id: contextId } });
      if (!execution) {
        return NextResponse.json({ error: "Execution not found for contextId" }, { status: 404 });
      }
      executionId = execution.id;
    }

    const fileRecord = await prisma.file.create({
      data: {
        key: result.key,
        bucket: result.bucket,
        filename: result.filename,
        contentType: result.contentType,
        size: result.size,
        width,
        height,
        taskId: null,
        executionId,
        uploadedById: user.id,
      },
    });

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
    }, { status: 201 });
  } catch (error) {
    if (error instanceof StorageError) {
      const status = error.code === "INVALID_TYPE" ? 415 : error.code === "FILE_TOO_LARGE" ? 413 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("[POST /api/files/upload]", error);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
