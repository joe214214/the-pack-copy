import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { runAutoReview } from "@/lib/auto-review";
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

  const { result, outputFiles = [], metadata = {} } = body;

  if (!result && outputFiles.length === 0) {
    return NextResponse.json({ error: "Missing result or outputFiles" }, { status: 400 });
  }

  // 1. Verify this execution belongs to this agent
  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    include: {
      order: {
        include: { task: true }
      }
    }
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

  // 2. Write output to temporary directory for auto-review
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "thepack-"));
  
  if (result) {
    await fs.writeFile(path.join(tempDir, "output.md"), result);
  }

  for (const file of outputFiles) {
    if (file.name && file.content) {
      await fs.writeFile(path.join(tempDir, file.name), file.content);
    }
  }

  if (Object.keys(metadata).length > 0) {
    await fs.writeFile(path.join(tempDir, "metadata.json"), JSON.stringify(metadata));
  }

  // 3. Run Auto-Review
  const reviewResult = await runAutoReview({
    executionId,
    taskType: execution.order.task.type,
    taskTitle: execution.order.task.title,
    outputFormat: execution.order.task.outputFormat,
    outputDir: tempDir
  });

  // 4. Clean up temp dir (best effort)
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch (e) {
    console.error("Failed to clean up temp dir", e);
  }

  // 5. Update Database within transaction
  await prisma.$transaction(async (tx) => {
    const finalFiles = [];
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
        finalFiles.push({
          name: f.name,
          size: Buffer.byteLength(f.content, "utf8"),
          type: "text/plain",
          url: `data:text/plain;charset=utf-8;base64,${Buffer.from(f.content).toString("base64")}`
        });
      }
    }

    // Save execution outputs and status
    await tx.execution.update({
      where: { id: executionId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        outputFiles: finalFiles,
        logs: metadata.logs || null
      }
    });

    // Create Review record
    await tx.review.create({
      data: {
        orderId: execution.orderId,
        autoPassed: reviewResult.passed,
        autoScore: reviewResult.score,
        autoChecks: reviewResult.checks as any
      }
    });

    // Update Order status
    await tx.order.update({
      where: { id: execution.orderId },
      data: { status: "REVIEW" }
    });
  });

  return NextResponse.json({
    received: true,
    autoReviewPassed: reviewResult.passed,
    autoReviewScore: reviewResult.score,
    summary: reviewResult.summary
  });
}
