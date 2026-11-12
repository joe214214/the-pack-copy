/**
 * Direct-to-storage uploads (bypasses the ~4.5 MB Vercel body limit).
 *
 *   1. client → POST …/upload-url  { filename, contentType, size, … }
 *        server validates, returns { signedUrl, ticket }
 *   2. client → PUT signedUrl  (raw bytes, same Content-Type) — straight to Supabase
 *   3. client → POST …/complete    { ticket }
 *        server verifies the stored object matches what was declared, then
 *        creates the File record and returns it (same shape as the old upload).
 *
 * The ticket is an HMAC-signed statement of what the server agreed to accept
 * and for whom, so `complete` cannot be pointed at someone else's object or
 * used to register a file under different metadata.
 */
import crypto from "crypto";
import {
  statFile, readFileHead, deleteFile, isImageContentType, detectContentType,
  StorageError, type StorageBucket,
} from "@/lib/storage";

export interface UploadTicket {
  key: string;
  bucket: StorageBucket;
  filename: string;
  contentType: string;
  size: number;
  /** Who may complete it: `user:<id>` or `agent:<id>`. */
  owner: string;
  /** Execution the file belongs to (task-outputs), if any. */
  executionId?: string | null;
  exp: number; // epoch ms
}

const TICKET_TTL_MS = 2 * 60 * 60 * 1000; // matches the signed upload URL lifetime

function secret(): string {
  return process.env.AUTH_SECRET || "thepack_dev_secret_change_me";
}

export function signTicket(t: Omit<UploadTicket, "exp">): string {
  const payload = Buffer.from(JSON.stringify({ ...t, exp: Date.now() + TICKET_TTL_MS })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyTicket(ticket: unknown, owner: string): UploadTicket {
  if (typeof ticket !== "string" || !ticket.includes(".")) {
    throw new StorageError("Missing or malformed upload ticket", "INVALID_TICKET");
  }
  const [payload, sig] = ticket.split(".");
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new StorageError("Invalid upload ticket", "INVALID_TICKET");
  }
  const t = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as UploadTicket;
  if (t.exp < Date.now()) throw new StorageError("Upload ticket expired", "INVALID_TICKET");
  if (t.owner !== owner) throw new StorageError("Upload ticket belongs to someone else", "INVALID_TICKET");
  return t;
}

/** Image dimensions from header bytes (PNG/JPEG/WebP-VP8/GIF). */
export function getImageDimensions(buffer: Buffer, contentType: string): { width: number; height: number } | null {
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
    if (contentType === "image/webp" && buffer.length > 30 && buffer.subarray(8, 12).toString() === "WEBP") {
      if (buffer.subarray(12, 16).toString() === "VP8 ") {
        return { width: buffer.readUInt16LE(26) & 0x3FFF, height: buffer.readUInt16LE(28) & 0x3FFF };
      }
    }
    if (contentType === "image/gif" && buffer.length >= 10) {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
  } catch { /* unparseable header — no dimensions */ }
  return null;
}

/**
 * Agents mislabel deliverables (a web page as text/plain, "index.html.txt").
 * Content-sniff HTML, else trust a known extension over a generic caller type.
 * Mirrors the multipart agent upload route.
 */
export function normalizeAgentContentType(filename: string, declared: string, head?: Buffer): string {
  if (head) {
    const h = head.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
    if (h.startsWith("<!doctype html") || h.startsWith("<html")) return "text/html";
  }
  const detected = detectContentType(filename);
  return detected !== "application/octet-stream" ? detected : declared;
}

/**
 * Confirms the object a client PUT matches its ticket. On mismatch the object
 * is deleted so nothing unverified lingers in the bucket.
 */
export async function verifyStoredObject(
  t: UploadTicket, opts: { sniffHtml?: boolean } = {}
): Promise<{ contentType: string; size: number; width: number | null; height: number | null }> {
  let stat;
  try {
    stat = await statFile(t.key);
  } catch {
    throw new StorageError("Upload not found in storage — PUT the file to signedUrl before completing", "NOT_FOUND");
  }
  const reject = async (msg: string) => {
    await deleteFile(t.key).catch(() => {});
    throw new StorageError(msg, "UPLOAD_MISMATCH");
  };
  if (stat.size !== t.size) await reject(`Uploaded size ${stat.size} does not match declared ${t.size}`);
  if (stat.contentType && stat.contentType !== t.contentType) {
    await reject(`Uploaded type '${stat.contentType}' does not match declared '${t.contentType}'`);
  }

  const needHead = opts.sniffHtml || isImageContentType(t.contentType);
  const head = needHead ? await readFileHead(t.key).catch(() => undefined) : undefined;
  const contentType = opts.sniffHtml ? normalizeAgentContentType(t.filename, t.contentType, head) : t.contentType;
  const dims = head && isImageContentType(contentType) ? getImageDimensions(head, contentType) : null;
  return { contentType, size: stat.size, width: dims?.width ?? null, height: dims?.height ?? null };
}

/** HTTP status for a StorageError raised anywhere in the upload flow. */
export function storageErrorStatus(e: StorageError): number {
  switch (e.code) {
    case "INVALID_TYPE": return 415;
    case "FILE_TOO_LARGE": return 413;
    case "NOT_FOUND": return 404;
    case "INVALID_TICKET": return 403;
    default: return 400;
  }
}
