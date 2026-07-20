import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getFileUrl } from "@/lib/storage";
import { z } from "zod";

// ============================================================================
// GET /api/tasks — List tasks
// Query params: scope=mine|open|all, type=..., status=..., limit=..., offset=...
// ============================================================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") ?? "open";
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
    const offset = parseInt(searchParams.get("offset") ?? "0");

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (scope === "open") {
      where.status = "OPEN";
    } else if (scope === "mine") {
      const user = await getCurrentUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      where.publisherId = user.id;
    }

    if (type) where.type = type;
    if (status) where.status = status;

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          publisher: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.task.count({ where }),
    ]);

    return NextResponse.json({ tasks, total, limit, offset });
  } catch (error) {
    console.error("[GET /api/tasks]", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

// ============================================================================
// POST /api/tasks — Create a new task
// ============================================================================
const createTaskSchema = z.object({
  type: z.enum([
    "CONTENT_WRITING",
    "CONTENT_EDITING",
    "SUMMARIZATION",
    "TRANSLATION",
    "REPORT_GENERATION",
    "DATA_EXTRACTION",
    "TEMPLATE_FILLING",
    "FORMATTING",
    "IMAGE_GENERATION",
    "IMAGE_EDITING",
  ]),
  title: z.string().min(5).max(200),
  description: z.string().min(20).max(5000),
  budget: z.number().positive(),
  deadlineHours: z.number().int().positive(),
  outputFormat: z.string().optional(),
  qualityCriteria: z.record(z.string(), z.unknown()).optional(),
  // IDs of File records the wizard pre-uploaded (attachments)
  fileIds: z.array(z.string()).max(10).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = createTaskSchema.parse(body);
    const publisherId = user.id;

    const task = await prisma.task.create({
      data: {
        publisherId,
        type: data.type,
        title: data.title,
        description: data.description,
        budget: data.budget,
        deadlineHours: data.deadlineHours,
        outputFormat: data.outputFormat,
        qualityCriteria: (data.qualityCriteria ?? {}) as object,
        inputFiles: [],
        status: "OPEN",
      },
    });

    // Link pre-uploaded attachments to the task. Only files the caller uploaded
    // themselves and that aren't already attached elsewhere can be linked.
    if (data.fileIds && data.fileIds.length > 0) {
      await prisma.file.updateMany({
        where: {
          id: { in: data.fileIds },
          uploadedById: user.id,
          taskId: null,
          executionId: null,
          bucket: "task-inputs",
        },
        data: { taskId: task.id },
      });

      // Mirror into the legacy inputFiles JSON (what the task pages and the
      // agent gateway read): [{ id, name, url, size, type }]
      const linked = await prisma.file.findMany({ where: { taskId: task.id } });
      const inputFiles = linked.map((f) => ({
        id: f.id,
        name: f.filename,
        url: getFileUrl(f.key),
        size: f.size,
        type: f.contentType,
      }));
      await prisma.task.update({ where: { id: task.id }, data: { inputFiles } });
      // Reflect the linked attachments in the object we return — `task` was read
      // before the update, so without this the response would show inputFiles: [].
      (task as unknown as { inputFiles: unknown }).inputFiles = inputFiles;
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 422 });
    }
    console.error("[POST /api/tasks]", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
