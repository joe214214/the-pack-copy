/**
 * File Storage Service
 *
 * Backed by Supabase Storage. It used to write to the local filesystem, which
 * cannot work once the app is deployed: a serverless filesystem is read-only
 * apart from /tmp, and /tmp is per-instance and discarded, so a file written
 * while handling an upload was gone by the time a browser asked to download it.
 *
 * Key layout is unchanged — {bucket}/{contextId}/{timestamp}_{random}_{filename}
 * — so keys already stored in the database keep resolving. The first path
 * segment names the Supabase bucket and the remainder is the object path
 * inside it.
 *
 * Buckets are private; files reach the browser through /api/files/[key], which
 * looks the record up first. Nothing here hands out a public URL.
 */
import * as path from "path";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type StorageBucket = "task-inputs" | "task-outputs" | "avatars" | "revision-feedback";

export interface UploadResult {
  key: string;
  bucket: StorageBucket;
  filename: string;
  contentType: string;
  size: number;
}

const ALLOWED_TYPES: Record<StorageBucket, string[]> = {
  "task-inputs": [
    "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml",
    "application/pdf", "text/plain", "text/markdown", "text/csv", "application/json",
  ],
  // text/html is here because the runner instructs agents to deliver a web
  // page as an uploaded index.html. Anything script-capable in this list
  // (text/html, image/svg+xml) is served under a sandbox CSP by
  // /api/files/[key] so it cannot act as this site.
  "task-outputs": [
    "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml",
    "application/pdf", "text/plain", "text/markdown", "text/csv",
    "application/json", "application/octet-stream",
    "text/html", "text/css", "text/javascript",
  ],
  "avatars": ["image/png", "image/jpeg", "image/webp", "image/gif"],
  "revision-feedback": [
    "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml",
    "application/pdf", "text/plain", "text/markdown", "text/csv", "application/json",
  ],
};

const MAX_FILE_SIZE: Record<StorageBucket, number> = {
  "task-inputs": 10 * 1024 * 1024,
  "task-outputs": 20 * 1024 * 1024,
  "avatars": 2 * 1024 * 1024,
  "revision-feedback": 10 * 1024 * 1024,
};

/** Every bucket this module owns, for provisioning and key validation. */
export const STORAGE_BUCKETS = Object.keys(ALLOWED_TYPES) as StorageBucket[];

export class StorageError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "StorageError";
  }
}

export function generateKey(bucket: StorageBucket, contextId: string, filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString("hex");
  return `${bucket}/${contextId}/${timestamp}_${random}_${sanitized}`;
}

export function validateFile(bucket: StorageBucket, contentType: string, size: number): void {
  const allowed = ALLOWED_TYPES[bucket];
  if (!allowed.includes(contentType)) {
    throw new StorageError(
      `File type '${contentType}' not allowed in bucket '${bucket}'. Allowed: ${allowed.join(", ")}`,
      "INVALID_TYPE"
    );
  }
  const maxSize = MAX_FILE_SIZE[bucket];
  if (size > maxSize) {
    throw new StorageError(
      `File size ${(size / 1024 / 1024).toFixed(1)}MB exceeds limit ${(maxSize / 1024 / 1024).toFixed(0)}MB`,
      "FILE_TOO_LARGE"
    );
  }
}

/** Splits a storage key into the Supabase bucket and the path within it. */
function splitKey(key: string): { bucket: StorageBucket; objectPath: string } {
  const slash = key.indexOf("/");
  if (slash <= 0 || slash === key.length - 1) {
    throw new StorageError(`Malformed storage key: ${key}`, "INVALID_KEY");
  }
  const bucket = key.slice(0, slash) as StorageBucket;
  if (!(bucket in ALLOWED_TYPES)) {
    throw new StorageError(`Unknown bucket in key: ${key}`, "INVALID_KEY");
  }
  return { bucket, objectPath: key.slice(slash + 1) };
}

export async function uploadFile(
  bucket: StorageBucket, contextId: string, filename: string,
  content: Buffer, contentType: string
): Promise<UploadResult> {
  validateFile(bucket, contentType, content.length);
  const key = generateKey(bucket, contextId, filename);
  const { objectPath } = splitKey(key);

  const { error } = await getSupabaseAdmin()
    .storage
    .from(bucket)
    .upload(objectPath, content, { contentType, upsert: false });

  if (error) {
    throw new StorageError(
      `Upload to bucket '${bucket}' failed: ${error.message}`,
      "UPLOAD_FAILED"
    );
  }

  return { key, bucket, filename, contentType, size: content.length };
}

export async function readFile(key: string): Promise<Buffer> {
  const { bucket, objectPath } = splitKey(key);

  const { data, error } = await getSupabaseAdmin()
    .storage
    .from(bucket)
    .download(objectPath);

  if (error || !data) {
    throw new StorageError(`File not found: ${key}`, "NOT_FOUND");
  }

  return Buffer.from(await data.arrayBuffer());
}

export async function deleteFile(key: string): Promise<void> {
  const { bucket, objectPath } = splitKey(key);
  // Removing something that is already gone is reported the same way as a
  // successful removal, so there is no missing-file case to special-case here.
  const { error } = await getSupabaseAdmin().storage.from(bucket).remove([objectPath]);
  if (error) {
    throw new StorageError(`Delete of ${key} failed: ${error.message}`, "DELETE_FAILED");
  }
}

export function getFileUrl(key: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${appUrl}/api/files/${encodeURIComponent(key)}`;
}

export function isImageContentType(contentType: string): boolean {
  return contentType.startsWith("image/");
}

export function detectContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
    ".pdf": "application/pdf", ".txt": "text/plain", ".md": "text/markdown",
    ".csv": "text/csv", ".json": "application/json",
    ".html": "text/html", ".htm": "text/html", ".css": "text/css", ".js": "text/javascript",
  };
  return mimeMap[ext] || "application/octet-stream";
}
