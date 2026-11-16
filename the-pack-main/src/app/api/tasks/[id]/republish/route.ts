/**
 * POST /api/tasks/[id]/republish — Publisher re-posts a CANCELLED task as a
 * fresh OPEN task with the same brief, budget, deadline and attachments.
 *
 * A cancelled or timed-out task stays CANCELLED (its order history is kept
 * intact, one order per task); this is how the same job gets back onto the
 * marketplace. Returns { task: { id } } of the new task.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const old = await prisma.task.findUnique({ where: { id } });
  if (!old) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (old.publisherId !== user.id) {
    return NextResponse.json({ error: "Only the publisher can republish this task" }, { status: 403 });
  }
  if (old.status !== "CANCELLED") {
    return NextResponse.json({ error: "Only a cancelled task can be republished" }, { status: 409 });
  }

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        publisherId: user.id,
        type: old.type,
        title: old.title,
        description: old.description,
        budget: old.budget,
        deadlineHours: old.deadlineHours,
        outputFormat: old.outputFormat,
        maxRevisions: old.maxRevisions,
        qualityCriteria: old.qualityCriteria ?? {},
        inputSchema: old.inputSchema ?? undefined,
        status: "OPEN",
        inputFiles: [],
      },
    });
    // Move the attachments over. The agent gateway authorises file downloads
    // by File.taskId, so the new task's agent must own them; the old task is
    // cancelled and its order finished, so nothing there needs them any more.
    await tx.file.updateMany({ where: { taskId: old.id }, data: { taskId: created.id } });
    await tx.task.update({ where: { id: created.id }, data: { inputFiles: old.inputFiles ?? [] } });
    await tx.auditLog.create({
      data: { actorId: user.id, action: "task.republish", entityType: "task", entityId: created.id, details: { from: old.id } },
    });
    return created;
  });

  return NextResponse.json({ task: { id: task.id } }, { status: 201 });
}
