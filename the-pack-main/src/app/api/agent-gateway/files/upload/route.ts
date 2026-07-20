/**
 * POST /api/agent-gateway/files/upload — Agent file upload
 *
 * Allows agents to upload binary files (images, documents) during execution.
 * Used in two-step submission: upload file → submit with fileIds.
 *
 * Auth: Bearer API Key (agent authentication)
 * Body, either:
 *   - multipart/form-data with `file` + `executionId`, OR
 *   - application/json { executionId, filename, sourceUrl, contentType? } —
 *     the server fetches sourceUrl itself (host-allowlisted). This lets an agent
 *     hand off an image it produced via a tool that returns a URL (e.g. a Figma
 *     screenshot) WITHOUT round-tripping multi-KB base64 through the model.
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

// Hosts the server is allowed to fetch a sourceUrl from. Kept tight to avoid
// SSRF — only asset hosts we expect agents to hand back. Extend via env
// FILE_FETCH_ALLOW_HOSTS (comma-separated, matched as suffixes).
const DEFAULT_FETCH_HOSTS = ["figma.com"];
function isAllowedFetchHost(hostname: string): boolean {
  const extra = (process.env.FILE_FETCH_ALLOW_HOSTS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const allow = [...DEFAULT_FETCH_HOSTS, ...extra];
  const h = hostname.toLowerCase();
  return allow.some((a) => h === a || h.endsWith(`.${a}`));
}

const MAX_FETCH_BYTES = 25 * 1024 * 1024; // 25 MB ceiling for server-side fetch

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
    // Gather (executionId, filename, buffer, contentType) from EITHER a
    // multipart upload or a JSON sourceUrl the server fetches itself.
    const reqContentType = request.headers.get("content-type") || "";
    let executionId: string | null = null;
    let filename = "";
    let buffer: Buffer;
    let contentType = "";

    if (reqContentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      executionId = formData.get("executionId") as string | null;
      if (!file) {
        return NextResponse.json({ error: "Missing 'file' in form data" }, { status: 400 });
      }
      if (!executionId) {
        return NextResponse.json({ error: "Missing 'executionId'" }, { status: 400 });
      }
      buffer = Buffer.from(await file.arrayBuffer());
      filename = file.name;
      contentType = file.type || detectContentType(file.name);
    } else {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      executionId = body.executionId ?? null;
      filename = String(body.filename || "");
      const sourceUrl = String(body.sourceUrl || "");
      if (!executionId) {
        return NextResponse.json({ error: "Missing 'executionId'" }, { status: 400 });
      }
      if (!filename) {
        return NextResponse.json({ error: "Missing 'filename'" }, { status: 400 });
      }
      if (!sourceUrl) {
        return NextResponse.json({ error: "Provide 'file' (multipart) or 'sourceUrl' (json)" }, { status: 400 });
      }
      let parsed: URL;
      try {
        parsed = new URL(sourceUrl);
      } catch {
        return NextResponse.json({ error: "sourceUrl is not a valid URL" }, { status: 400 });
      }
      if (parsed.protocol !== "https:") {
        return NextResponse.json({ error: "sourceUrl must be https" }, { status: 400 });
      }
      if (!isAllowedFetchHost(parsed.hostname)) {
        return NextResponse.json({ error: `sourceUrl host not allowed: ${parsed.hostname}` }, { status: 400 });
      }
      const fetched = await fetch(sourceUrl);
      if (!fetched.ok) {
        return NextResponse.json({ error: `Could not fetch sourceUrl [${fetched.status}]` }, { status: 400 });
      }
      const ab = await fetched.arrayBuffer();
      if (ab.byteLength > MAX_FETCH_BYTES) {
        return NextResponse.json({ error: "Fetched file exceeds size limit" }, { status: 413 });
      }
      buffer = Buffer.from(ab);
      contentType = String(body.contentType || fetched.headers.get("content-type") || detectContentType(filename)).split(";")[0].trim();
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

    const result = await uploadFile("task-outputs", executionId, filename, buffer, contentType);

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
