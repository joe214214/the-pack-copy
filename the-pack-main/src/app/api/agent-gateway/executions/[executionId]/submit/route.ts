import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { runAutoReview } from "@/lib/auto-review";
import { getFileUrl } from "@/lib/storage";
import { markDelivered } from "@/lib/orders/lifecycle";
import { lifecycleErrorResponse } from "@/lib/orders/http";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ executionId: string }> }
) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;

  const { agent } = auth;
  const { executionId } = await params;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { result, outputFiles = [], fileIds = [], metadata = {} } = body;

  if (!result && outputFiles.length === 0 && fileIds.length === 0) {
    return NextResponse.json({ error: "Missing result, outputFiles, or fileIds" }, { status: 400 });
  }

  // 1. Verify this execution belongs to this agent
  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    include: {
      order: {
        include: {
          task: {
            include: { files: { select: { id: true, filename: true, contentType: true } } },
          },
        },
      },
    },
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
  // Checked again atomically in markDelivered(); this early exit just avoids
  // running the auto-review for an order that can no longer take a delivery.
  if (execution.order.status !== "EXECUTING" && execution.order.status !== "REVISION_REQUESTED") {
    return NextResponse.json({ error: `Order is ${execution.order.status}; it is not accepting deliveries` }, { status: 409 });
  }

  // 2. Write output to temporary directory for auto-review
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "thepack-"));
  
  if (result) {
    await fs.writeFile(path.join(tempDir, "output.md"), result);
  }

  for (const file of outputFiles) {
    if (file.name && file.content) {
      // Support both text content and base64-encoded binary
      if (file.encoding === "base64") {
        await fs.writeFile(path.join(tempDir, file.name), Buffer.from(file.content, "base64"));
      } else {
        await fs.writeFile(path.join(tempDir, file.name), file.content);
      }
    }
  }

  // If fileIds provided, also write those files to temp dir for review
  let uploadedFiles: Array<{ id: string; key: string; filename: string; contentType: string; size: number }> = [];
  if (fileIds.length > 0) {
    uploadedFiles = await prisma.file.findMany({
      where: {
        id: { in: fileIds },
        executionId: executionId,
      },
      select: { id: true, key: true, filename: true, contentType: true, size: true },
    });

    // For auto-review: copy uploaded files to temp dir. For large binaries
    // (> 2 MB, e.g. video) only fetch the first 64 KB — auto-review only
    // checks magic bytes in the header and gets the real byte size from the
    // File record (`fileSizes` below), so we never pull 20×50 MB into /tmp.
    const { readFile, readFileHead } = await import("@/lib/storage");
    for (const f of uploadedFiles) {
      try {
        const content = f.size > 2 * 1024 * 1024
          ? await readFileHead(f.key, 64 * 1024)
          : await readFile(f.key);
        await fs.writeFile(path.join(tempDir, f.filename), content);
      } catch {
        // File might not exist if upload was incomplete — skip
      }
    }
  }

  if (Object.keys(metadata).length > 0) {
    await fs.writeFile(path.join(tempDir, "metadata.json"), JSON.stringify(metadata));
  }

  // 3. Run Auto-Review
  const taskInputs = execution.order.task.files ?? [];
  const mediaInputs = taskInputs.filter(
    (f) => f.contentType.startsWith("image/") || f.contentType.startsWith("video/")
  );
  const fileSizes = Object.fromEntries(uploadedFiles.map((f) => [f.filename, f.size]));

  const reviewResult = await runAutoReview({
    executionId,
    taskType: execution.order.task.type,
    taskTitle: execution.order.task.title,
    outputFormat: execution.order.task.outputFormat,
    outputDir: tempDir,
    qualityCriteria: execution.order.task.qualityCriteria as Record<string, unknown> | null,
    expectedInputCount: mediaInputs.length,
    fileSizes,
  });

  // 4. Clean up temp dir (best effort)
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (e) {
    console.error("Failed to clean up temp dir", e);
  }

  // 5. Update Database within transaction
  try {
  await prisma.$transaction(async (tx) => {
    // Build the output files list
    const finalFiles: Array<{ name: string; size: number; type: string; url: string }> = [];

    // Legacy mode: inline text content as Base64 Data URIs (backward compatible)
    if (result) {
      finalFiles.push({
        name: "output.md",
        size: Buffer.byteLength(result, "utf8"),
        type: "text/markdown",
        url: `data:text/markdown;charset=utf-8;base64,${Buffer.from(result).toString("base64")}`
      });
    }

    for (const f of outputFiles) {
      if (f.name && f.content) {
        // Sniff HTML so an inline web-page deliverable previews as a live page
        // (data:text/html) instead of source text — agents leave contentType off
        // or send "text/plain". Falls back to the caller's type / plain text.
        let contentType = f.contentType || "text/plain";
        if (f.encoding !== "base64") {
          const head = String(f.content).trimStart().slice(0, 512).toLowerCase();
          if (head.startsWith("<!doctype html") || head.startsWith("<html")) {
            contentType = "text/html";
          } else if (/\.html?$/i.test(f.name)) {
            contentType = "text/html";
          }
        }
        if (f.encoding === "base64") {
          const buf = Buffer.from(f.content, "base64");
          finalFiles.push({
            name: f.name,
            size: buf.length,
            type: contentType,
            url: `data:${contentType};base64,${f.content}`
          });
        } else {
          finalFiles.push({
            name: f.name,
            size: Buffer.byteLength(f.content, "utf8"),
            type: contentType,
            url: `data:${contentType};charset=utf-8;base64,${Buffer.from(f.content).toString("base64")}`
          });
        }
      }
    }

    // New mode: reference already-uploaded files via storage URLs
    for (const f of uploadedFiles) {
      finalFiles.push({
        name: f.filename,
        size: f.size,
        type: f.contentType,
        url: getFileUrl(f.key),
      });
    }

    // Save execution outputs. Status moves in markDelivered() below. Progress
    // logs reported during the run are kept unless the agent sends its own.
    await tx.execution.update({
      where: { id: executionId },
      data: {
        outputFiles: finalFiles,
        ...(metadata.logs ? { logs: metadata.logs } : {}),
      }
    });

    // Upsert Review record (create on first submit, update on re-submit after revision)
    await tx.review.upsert({
      where: { orderId: execution.orderId },
      create: {
        orderId: execution.orderId,
        autoPassed: reviewResult.passed,
        autoScore: reviewResult.score,
        autoChecks: reviewResult.checks as any,
      },
      update: {
        autoPassed: reviewResult.passed,
        autoScore: reviewResult.score,
        autoChecks: reviewResult.checks as any,
        userAccepted: null,  // reset previous user decision
        userRating: null,
        userComment: null,
        updatedAt: new Date(),
      },
    });

    // Execution -> COMPLETED and Order -> REVIEW, both compare-and-set: a
    // cancelled, timed-out or disputed order can no longer be revived by a
    // late submission (it throws and the whole transaction rolls back).
    await markDelivered(tx, { orderId: execution.orderId, executionId });
  });
  } catch (e) {
    return lifecycleErrorResponse(e, "POST /api/agent-gateway/executions/[id]/submit");
  }

  return NextResponse.json({
    received: true,
    autoReviewPassed: reviewResult.passed,
    autoReviewScore: reviewResult.score,
    summary: reviewResult.summary
  });
}
