"use client";

import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Upload, X, FileText, ImageIcon, Loader2, CheckCircle2 } from "lucide-react";

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

export function FileUpload({
  bucket,
  contextId,
  accept = "image/*,.pdf,.txt,.md,.csv,.json",
  maxFiles = 10,
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
        const formData = new FormData();
        formData.append("file", file);
        formData.append("bucket", bucket);
        formData.append("contextId", contextId);

        const res = await fetch("/api/files/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(data.error || `Upload failed: ${res.status}`);
        }

        const data = await res.json();
        newFiles.push(data.file);
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
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
              )}

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
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
