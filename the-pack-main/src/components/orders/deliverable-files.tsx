"use client";

import { Download, ExternalLink, FileText } from "lucide-react";

const PREVIEWABLE = /\.(html?|svg|pdf|txt|md|json|csv)$/i;
const IMAGE_NAME = /\.(png|jpe?g|webp|gif)$/i;
const HTML_NAME = /\.html?$/i;

export type DeliverableFile = {
  name?: string;
  url?: string;
  type?: string;
  size?: number;
};

interface DeliverableFilesProps {
  files: DeliverableFile[];
  /**
   * Real URL to use for "open in a new tab". An inline deliverable is stored as
   * a `data:` URI and a browser refuses to open one as a top-level navigation,
   * so the caller supplies a route that re-serves it. Return undefined to fall
   * back to the file's own url.
   *
   * This is a prop rather than something the component works out, because the
   * right route depends on WHERE the files came from: the current delivery and
   * a snapshot in revision history both contain a file called "index.html", and
   * resolving a historical one against the current execution would quietly show
   * the newest version under an older round's heading.
   */
  openUrlFor?: (file: DeliverableFile) => string | undefined;
  /**
   * Leave out the inline page preview. Revision history stacks several
   * deliveries on one screen, where a full-height iframe each would bury
   * everything else.
   */
  compact?: boolean;
}

function sizeLabel(size?: number): string | null {
  if (typeof size !== "number" || Number.isNaN(size)) return null;
  return `${(size / 1024).toFixed(1)} KB`;
}

export function DeliverableFiles({
  files,
  openUrlFor,
  compact = false,
}: DeliverableFilesProps) {
  if (!files || files.length === 0) return null;

  const isImage = (f: DeliverableFile) =>
    f.type?.startsWith("image/") || IMAGE_NAME.test(f.name ?? "");

  const imageFiles = files.filter(isImage);
  const otherFiles = files.filter((f) => !isImage(f));

  return (
    <div className="space-y-3">
      {imageFiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {imageFiles.map((file, i) => (
            <a
              key={`${file.name}-${i}`}
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative aspect-video overflow-hidden rounded-lg border bg-muted transition-colors hover:border-primary/50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={file.url}
                alt={file.name ?? "Delivered image"}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                <p className="truncate text-xs text-white">{file.name}</p>
                {sizeLabel(file.size) && (
                  <p className="text-xs text-white/70">{sizeLabel(file.size)}</p>
                )}
              </div>
            </a>
          ))}
        </div>
      )}

      {otherFiles.map((file, i) => {
        const isHtml = file.type === "text/html" || HTML_NAME.test(file.name ?? "");
        const previewable =
          isHtml ||
          file.type?.startsWith("text/") ||
          file.type === "application/pdf" ||
          PREVIEWABLE.test(file.name ?? "");
        const openUrl = openUrlFor?.(file) ?? file.url;

        const actions = (
          <>
            {sizeLabel(file.size) && (
              <span className="text-xs text-muted-foreground">
                {sizeLabel(file.size)}
              </span>
            )}
            {isHtml && openUrl && (
              <a
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open this page in a new tab"
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </a>
            )}
            {previewable && !isHtml && openUrl && (
              <a
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in a new tab"
              >
                <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
              </a>
            )}
            {file.url && (
              <a href={file.url} download={file.name} title="Download">
                <Download className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </a>
            )}
          </>
        );

        return (
          <div key={`${file.name}-${i}`} className="space-y-2">
            {/* Compact lives in the ~220px revision-history column, where one
                row of name + size + two actions leaves the filename no width
                at all — it collapsed to "o…" and sometimes to nothing. Give
                the name its own line there and let the actions sit under it. */}
            {compact ? (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">
                    {file.name}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {actions}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {file.name}
                </span>
                {actions}
              </div>
            )}

            {/* Live preview of a delivered web page. Sandboxed (allow-scripts,
                no allow-same-origin) → the page's JS runs but cannot touch this
                site's cookies or DOM. */}
            {isHtml && !compact && openUrl && (
              <iframe
                src={openUrl}
                title={`Preview of ${file.name}`}
                sandbox="allow-scripts"
                className="h-96 w-full rounded-lg border bg-white"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
