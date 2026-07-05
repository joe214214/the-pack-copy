/**
 * POST /api/agent-gateway/files/upload — Agent file upload
 *
 * Allows agents to upload binary files (images, documents) during execution.
 * Used in two-step submission: upload file → submit with fileIds.
 *
 * Auth: Bearer API Key (agent authentication)
 * Body: multipart/form-data with file + executionId
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import {
  uploadFile,
  getFileUrl,
  isImageContentType,
  detectContentType,
  StorageError,
} from "@/lib/storage";

// Simple image dimension extraction from headers
function getImageDimensions(buffer: Buffer, contentType: string): { width: number; height: number } | null {
  try {
    if (contentType === "image/png" && buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (contentType === "image/jpeg") {
      let offset = 2;
      while (offset < buffer.length - 9) {
        if (buffer[offset] === 0xFF) {
          const marker = buffer[offset + 1];
          if (marker === 0xC0 || marker === 0xC2) {
            return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
          }
          offset += 2 + buffer.readUInt16BE(offset + 2);
        } else { offset++; }
      }
    }
    if (contentType === "image/webp" && buffer.length > 30 && buffer.slice(8, 12).toString() === "WEBP") {
      if (buffer.slice(12, 16).toString() === "VP8 ") {
        return { width: buffer.readUInt16LE(26) & 0x3FFF, height: buffer.readUInt16LE(28) & 0x3FFF };
      }
    }
  } catch { /* ignore parse errors */ }
  return null;
}

export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;
  const { agent } = auth;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const executionId = formData.get("executionId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Missing 'file' in form data" }, { status: 400 });
    }
    if (!executionId) {
      return NextResponse.json({ error: "Missing 'executionId'" }, { status: 400 });
    }

    // Verify this execution belongs to this agent
    const execution = await prisma.execution.findUnique({
      where: { id: executionId },
      include: { order: true },
    });

    if (!execution) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404 });
    }
    if (execution.order.agentId !== agent.id) {
      return NextResponse.json({ error: "Unauthorized for this execution" }, { status: 403 });
    }
    if (execution.status !== "PENDING" && execution.status !== "RUNNING") {
      return NextResponse.json({ error: `Execution already ${execution.status}` }, { status: 400 });
    }

    // Read and upload file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = file.type || detectContentType(file.name);

    const result = await uploadFile("task-outputs", executionId, file.name, buffer, contentType);

    // Extract image dimensions
    let width: number | null = null;
    let height: number | null = null;
    if (isImageContentType(contentType)) {
      const dims = getImageDimensions(buffer, contentType);
      if (dims) { width = dims.width; height = dims.height; }
    }

    // Create File record
    const fileRecord = await prisma.file.create({
      data: {
        key: result.key,
        bucket: "task-outputs",
        filename: result.filename,
        contentType: result.contentType,
        size: result.size,
        width,
        height,
        executionId,
        uploadedById: execution.order.publisherId, // attribute to the order's publisher
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
    console.error("[POST /api/agent-gateway/files/upload]", error);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
