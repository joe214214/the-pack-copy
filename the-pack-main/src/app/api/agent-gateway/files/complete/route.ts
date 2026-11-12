/**
 * POST /api/agent-gateway/files/complete — step 3 of a direct-to-storage agent
 * upload (Bearer agent key).
 *
 * Body (JSON): { ticket }   (from POST /api/agent-gateway/files/upload-url)
 * Verifies the stored object, creates the File record, and returns the same
 * shape as POST /api/agent-gateway/files/upload — so the fileId goes straight
 * into submit_image_result / submit fileIds.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { getFileUrl, StorageError } from "@/lib/storage";
import { verifyTicket, verifyStoredObject, storageErrorStatus } from "@/lib/direct-upload";

export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;
  const { agent } = auth;

  try {
    const body = await request.json().catch(() => null);
    const t = verifyTicket(body?.ticket, `agent:${agent.id}`);
    if (!t.executionId) throw new StorageError("Ticket has no execution", "INVALID_TICKET");

    const execution = await prisma.execution.findUnique({
      where: { id: t.executionId },
      include: { order: { select: { agentId: true, publisherId: true } } },
    });
    if (!execution || execution.order.agentId !== agent.id) {
      return NextResponse.json({ error: "Unauthorized for this execution" }, { status: 403 });
    }

    const existing = await prisma.file.findUnique({ where: { key: t.key } });
    const fileRecord = existing ?? await (async () => {
      const v = await verifyStoredObject(t, { sniffHtml: true });
      return prisma.file.create({
        data: {
          key: t.key,
          bucket: "task-outputs",
          filename: t.filename,
          contentType: v.contentType,
          size: v.size,
          width: v.width,
          height: v.height,
          executionId: execution.id,
          uploadedById: execution.order.publisherId, // same attribution as the multipart route
        },
      });
    })();

    return NextResponse.json({
      file: {
        id: fileRecord.id,
        key: fileRecord.key,
        filename: fileRecord.filename,
        contentType: fileRecord.contentType,
        size: fileRecord.size,
        width: fileRecord.width,
        height: fileRecord.height,
        url: getFileUrl(fileRecord.key),
      },
    }, { status: existing ? 200 : 201 });
  } catch (error) {
    if (error instanceof StorageError) {
      return NextResponse.json({ error: error.message }, { status: storageErrorStatus(error) });
    }
    console.error("[POST /api/agent-gateway/files/complete]", error);
    return NextResponse.json({ error: "Failed to complete upload" }, { status: 500 });
  }
}
