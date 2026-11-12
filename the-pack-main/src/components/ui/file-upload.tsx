"use client";

import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Upload, X, FileText, Film, Loader2, CheckCircle2 } from "lucide-react";

const DEFAULT_MAX_FILES = (() => {
  const n = Number(process.env.NEXT_PUBLIC_MAX_TASK_FILES);
  return Number.isInteger(n) && n > 0 ? n : 20;
})();

export interface UploadedFile {
  id: string;
  key: string;
  filename: string;
  contentType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  url: string;
}

interface FileUploadProps {
  bucket: "task-inputs" | "task-outputs" | "revision-feedback";
  contextId: string;
  accept?: string;           // e.g., "image/*,.pdf"
  maxFiles?: number;
  onFilesChange?: (files: UploadedFile[]) => void;
  className?: string;
  label?: string;
  description?: string;
}

async function jsonOrThrow(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${fallback}: ${res.status}`);
  return data;
}

/**
 * Uploads straight to storage (signed URL), so the bytes never pass through
 * our API — Vercel caps request bodies at ~4.5 MB. See src/lib/direct-upload.ts.
 */
async function uploadDirect(
  file: File, bucket: FileUploadProps["bucket"], contextId: string
): Promise<UploadedFile> {
  const prep = await jsonOrThrow(
    await fetch("/api/files/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket, contextId, filename: file.name, contentType: file.type || undefined, size: file.size,
      }),
    }),
    "Upload failed"
  );

  const put = await fetch(prep.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": prep.contentType, "x-upsert": "false" },
    body: file,
  });
  if (!put.ok) {
    const detail = await put.text().catch(() => "");
    throw new Error(`Upload to storage failed: ${put.status} ${detail.slice(0, 200)}`);
  }

  const done = await jsonOrThrow(
    await fetch("/api/files/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: prep.ticket }),
    }),
    "Upload failed"
  );
  return done.file;
}

export function FileUpload({
  bucket,
  contextId,
  accept = "image/*,video/mp4,video/webm,video/quicktime,.pdf,.txt,.md,.csv,.json",
  maxFiles = DEFAULT_MAX_FILES,
  onFilesChange,
  className,
  label = "Upload Files",
  description = "Drag and drop files here, or click to browse",
}: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(async (fileList: FileList | File[]) => {
    const toUpload = Array.from(fileList).slice(0, maxFiles - files.length);
    if (toUpload.length === 0) return;

    setUploading(true);
    setError(null);

    const newFiles: UploadedFile[] = [];

    for (const file of toUpload) {
      try {
        newFiles.push(await uploadDirect(file, bucket, contextId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        break;
      }
    }

    const updated = [...files, ...newFiles];
    setFiles(updated);
    onFilesChange?.(updated);
    setUploading(false);
  }, [files, maxFiles, bucket, contextId, onFilesChange]);

  const removeFile = useCallback((index: number) => {
    const updated = files.filter((_, i) => i !== index);
    setFiles(updated);
    onFilesChange?.(updated);
  }, [files, onFilesChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  }, [uploadFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const isImage = (contentType: string) => contentType.startsWith("image/");
  const isVideo = (contentType: string) => contentType.startsWith("video/");
  const formatSize = (size: number) =>
    size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${(size / 1024).toFixed(1)} KB`;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
          uploading && "pointer-events-none opacity-60"
        )}
      >
        {uploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="h-8 w-8 text-muted-foreground/50" />
        )}
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground">
            {uploading ? "Uploading..." : label}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">{description}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={maxFiles > 1}
          className="hidden"
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Uploaded files list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => (
            <div
              key={file.id}
              className="flex items-center gap-3 rounded-lg border bg-card p-2.5"
            >
              {/* Thumbnail or icon */}
              {isImage(file.contentType) && file.url ? (
                <img
                  src={file.url}
                  alt={file.filename}
                  className="h-10 w-10 rounded object-cover border"
                />
              ) : isVideo(file.contentType) ? (
                <div className="flex h-10 w-10 items-center justify-center rounded bg-indigo-500/10 border border-indigo-500/30">
                  <Film className="h-5 w-5 text-indigo-400" />
                </div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
              )}

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(file.size)}
                  {file.width && file.height && ` · ${file.width}×${file.height}`}
                </p>
              </div>

              {/* Status + remove */}
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                className="h-7 w-7 p-0 shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* File count */}
      {files.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {files.length} / {maxFiles} file(s) uploaded
        </p>
      )}
    </div>
  );
}
