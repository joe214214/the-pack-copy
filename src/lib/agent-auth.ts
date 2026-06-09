import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function authenticateAgent(request: Request) {
  const authHeader = request.headers.get("Authorization");
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 }) };
  }

  const apiKey = authHeader.split(" ")[1];

  if (!apiKey) {
    return { error: NextResponse.json({ error: "API Key not provided" }, { status: 401 }) };
  }

  const agent = await prisma.agent.findUnique({
    where: { apiKey },
  });

  if (!agent) {
    return { error: NextResponse.json({ error: "Invalid API Key" }, { status: 403 }) };
  }

  return { agent };
}
