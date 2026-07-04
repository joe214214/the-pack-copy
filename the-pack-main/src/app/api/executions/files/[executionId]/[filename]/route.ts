/**
 * GET /api/executions/files/[executionId]/[filename]
 * — Serve output files from the execution sandbox to the browser.
 */
import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const OUTPUT_BASE_DIR = process.env.EXECUTION_OUTPUT_DIR ?? "/tmp/thepack-outputs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ executionId: string; filename: string }> }
) {
  const { executionId, filename } = await params;

  // Security: prevent path traversal
  const safeName = path.basename(filename);
  const filePath = path.join(OUTPUT_BASE_DIR, executionId, safeName);

  if (!filePath.startsWith(OUTPUT_BASE_DIR)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const content = fs.readFileSync(filePath);
  const ext = path.extname(safeName).slice(1);
  const contentType =
    ext === "md" ? "text/markdown; charset=utf-8" :
    ext === "json" ? "application/json" :
    ext === "txt" ? "text/plain; charset=utf-8" :
    "application/octet-stream";

  return new NextResponse(content, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
