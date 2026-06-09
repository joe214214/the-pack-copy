import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
      where.status = { in: ["OPEN", "MATCHED"] };
    } else if (scope === "mine") {
      // TODO: replace with real user from session
      // where.publisherId = session.user.id
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
  ]),
  title: z.string().min(5).max(200),
  description: z.string().min(20).max(5000),
  budget: z.number().positive(),
  deadlineHours: z.number().int().positive(),
  outputFormat: z.string().optional(),
  qualityCriteria: z.record(z.string(), z.unknown()).optional(),
  inputFiles: z.array(z.object({
    name: z.string(),
    url: z.string(),
    size: z.number(),
    type: z.string(),
  })).optional(),
  // TODO: publisherId from auth session
  publisherId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createTaskSchema.parse(body);

    // TODO: Get real publisherId from Supabase auth session
    // For now use the first publisher from seed
    let publisherId = data.publisherId;
    if (!publisherId) {
      const fallbackPublisher = await prisma.user.findFirst({
        where: { email: "alex@example.com" },
      });
      publisherId = fallbackPublisher?.id ?? "";
    }

    if (!publisherId) {
      return NextResponse.json({ error: "No publisher found" }, { status: 400 });
    }

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
        inputFiles: (data.inputFiles ?? []) as object[],
        status: "OPEN",
      },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 422 });
    }
    console.error("[POST /api/tasks]", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
