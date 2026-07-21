/**
 * File Storage Service
 *
 * Abstraction layer for file storage. Currently uses local filesystem.
 * Can be swapped to Supabase Storage / S3 / R2 by changing the implementation.
 *
 * Storage layout: uploads/{bucket}/{contextId}/{timestamp}_{random}_{filename}
 * Buckets: task-inputs, task-outputs, avatars
 */
import * as fs from "fs/promises";
import * as path from "path";
import crypto from "crypto";

const STORAGE_ROOT = process.env.STORAGE_ROOT || path.join(process.cwd(), "uploads");

export type StorageBucket = "task-inputs" | "task-outputs" | "avatars";

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
  "task-outputs": [
    "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml",
    "application/pdf", "text/plain", "text/markdown", "text/csv",
    "application/json", "application/octet-stream",
  ],
  "avatars": ["image/png", "image/jpeg", "image/webp", "image/gif"],
};

const MAX_FILE_SIZE: Record<StorageBucket, number> = {
  "task-inputs": 10 * 1024 * 1024,
  "task-outputs": 20 * 1024 * 1024,
  "avatars": 2 * 1024 * 1024,
};

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

export async function uploadFile(
  bucket: StorageBucket, contextId: string, filename: string,
  content: Buffer, contentType: string
): Promise<UploadResult> {
  validateFile(bucket, contentType, content.length);
  const key = generateKey(bucket, contextId, filename);
  const filePath = path.join(STORAGE_ROOT, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  return { key, bucket, filename, contentType, size: content.length };
}

export async function readFile(key: string): Promise<Buffer> {
  const filePath = path.join(STORAGE_ROOT, key);
  try {
    return await fs.readFile(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new StorageError(`File not found: ${key}`, "NOT_FOUND");
    }
    throw err;
  }
}

export async function deleteFile(key: string): Promise<void> {
  const filePath = path.join(STORAGE_ROOT, key);
  try { await fs.unlink(filePath); } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
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
