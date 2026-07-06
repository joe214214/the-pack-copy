import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";
import crypto from "crypto";

// GET /api/agents — List agents with optional filters
// Query params: taskType=..., tier=..., maxPrice=..., minRating=..., limit=..., offset=..., mine=true
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mine = searchParams.get("mine") === "true";
    if (mine) {
      const user = await getCurrentUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const agents = await prisma.agent.findMany({
        where: { ownerId: user.id },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ agents, total: agents.length });
    }

    const taskType = searchParams.get("taskType");
    const tier = searchParams.get("tier");
    const maxPrice = searchParams.get("maxPrice");
    const minRating = searchParams.get("minRating");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
    const offset = parseInt(searchParams.get("offset") ?? "0");
    const q = searchParams.get("q");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { status: "ACTIVE" };

    if (taskType) {
      where.supportedTaskTypes = { has: taskType };
    }
    if (tier) where.creditTier = tier;
    if (maxPrice) where.basePrice = { lte: parseFloat(maxPrice) };
    if (minRating) where.avgRating = { gte: parseFloat(minRating) };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const onlyOnline = searchParams.get("onlyOnline");
    if (onlyOnline === "true") {
      where.isOnline = true;
    }

    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true } },
        },
        orderBy: [{ creditScore: "desc" }, { avgRating: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.agent.count({ where }),
    ]);

    return NextResponse.json({ agents, total, limit, offset });
  } catch (error) {
    console.error("[GET /api/agents]", error);
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }
}

// ============================================================================
// POST /api/agents — Register a new agent owned by the current user.
// Auto-activates with a freshly generated API key and zeroed-out stats.
// ============================================================================
const TASK_TYPES = [
  "CONTENT_WRITING", "CONTENT_EDITING", "DATA_EXTRACTION", "REPORT_GENERATION",
  "TRANSLATION", "SUMMARIZATION", "FORMATTING", "TEMPLATE_FILLING",
  "IMAGE_GENERATION", "IMAGE_EDITING",
] as const;

// How the agent connects: Claude via MCP, an OpenClaw skill, or any custom
// HTTP client hitting the gateway directly. Purely informational — the
// gateway itself is identical for all of them.
const CONNECTION_TYPES = ["MCP", "OPENCLAW", "HTTP"] as const;

const createAgentSchema = z.object({
  name: z.string().min(2).max(60),
  description: z.string().min(10).max(1000),
  supportedTaskTypes: z.array(z.enum(TASK_TYPES)).min(1),
  basePrice: z.number().min(0).max(100000).default(0),
  modelInfo: z.string().max(120).optional(),
  connectionType: z.enum(CONNECTION_TYPES).default("MCP"),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "agent";
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const data = createAgentSchema.parse(body);

    const slug = `${slugify(data.name)}-${crypto.randomBytes(3).toString("hex")}`;
    const apiKey = `tpk_${crypto.randomBytes(18).toString("hex")}`;

    const agent = await prisma.agent.create({
      data: {
        ownerId: user.id,
        name: data.name.trim(),
        slug,
        description: data.description.trim(),
        modelInfo: data.modelInfo?.trim(),
        status: "ACTIVE",
        supportedTaskTypes: data.supportedTaskTypes,
        acceptTaskTypes: data.supportedTaskTypes,
        basePrice: data.basePrice,
        connectionType: data.connectionType,
        apiKey,
        isOnline: false,
        // Fresh agents start with a clean slate — no fabricated stats.
        avgCost: 0,
        avgDurationSecs: 0,
        successRate: 0,
        avgRating: 0,
        completedOrders: 0,
        totalOrders: 0,
        creditScore: 0,
        creditTier: "BRONZE",
        dailyCompleted: 0,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "agent.create",
        entityType: "agent",
        entityId: agent.id,
        details: { name: agent.name },
      },
    });

    // Return the API key once — it's how the owner connects their MCP client.
    return NextResponse.json({ agent, apiKey }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 422 });
    }
    console.error("[POST /api/agents]", error);
    return NextResponse.json({ error: "Failed to create agent" }, { status: 500 });
  }
}
