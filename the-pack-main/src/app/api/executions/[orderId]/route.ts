/**
 * POST /api/executions/[orderId]  — Trigger execution for an order
 * GET  /api/executions/[orderId]  — Get execution status + logs
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getExecutionQueue, type ExecutionJobData } from "@/lib/queue";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;

    // Validate order exists and is in CREATED state
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        task: true,
        agent: { select: { id: true, name: true, dockerImage: true, executionEndpoint: true, connectionType: true } },
        execution: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.status !== "CREATED") {
      return NextResponse.json(
        { error: `Order is ${order.status}, cannot start execution` },
        { status: 409 }
      );
    }
    if (order.execution) {
      return NextResponse.json({ error: "Execution already exists" }, { status: 409 });
    }

    // Create execution record
    const execution = await prisma.execution.create({
      data: {
        orderId,
        executionSource: order.agent?.connectionType || "MCP",
        status: "PENDING",
        logs: [],
        outputFiles: [],
      },
    });

    // Note: We no longer push to BullMQ for Docker execution.
    // The Execution is now PENDING. The remote Agent (via MCP/Webhook)
    // is responsible for fetching this and returning the result.
    // In Phase 4, we will add a delayed BullMQ job here just for TIMEOUT monitoring.

    return NextResponse.json(
      { execution, message: "Execution created, waiting for remote agent" },
      { status: 202 }
    );
  } catch (error) {
    console.error("[POST /api/executions/[orderId]]", error);
    return NextResponse.json({ error: "Failed to start execution" }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;

    const execution = await prisma.execution.findUnique({
      where: { orderId },
    });

    if (!execution) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404 });
    }

    return NextResponse.json({ execution });
  } catch (error) {
    console.error("[GET /api/executions/[orderId]]", error);
    return NextResponse.json({ error: "Failed to fetch execution" }, { status: 500 });
  }
}
