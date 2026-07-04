/**
 * GET  /api/tasks/[id]/match  — Run matching engine, return ranked agents
 */
import { NextRequest, NextResponse } from "next/server";
import { matchAgentsForTask } from "@/lib/matching";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Check for onlyAvailable query parameter
    const searchParams = req.nextUrl.searchParams;
    const onlyAvailable = searchParams.get("onlyAvailable") === "true";

    const matches = await matchAgentsForTask(id, { 
      limit: 6, 
      onlyAvailable 
    });
    
    return NextResponse.json({ matches });
  } catch (error) {
    console.error("[GET /api/tasks/[id]/match]", error);
    return NextResponse.json({ error: "Matching failed" }, { status: 500 });
  }
}
