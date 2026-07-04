import { NextRequest, NextResponse } from "next/server";
import { createMcpServer } from "@/lib/mcp/server";
import { NextSseTransport } from "@/lib/mcp/sse-transport";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// Global map to hold active SSE transports
const activeSessions = new Map<string, NextSseTransport>();

export async function GET(req: NextRequest) {
  try {
    // Support both Authorization header (Claude Code) and ?apiKey= query param (Claude Desktop)
    const authHeader = req.headers.get("Authorization");
    const url = new URL(req.url);
    const queryApiKey = url.searchParams.get("apiKey");
    
    let apiKey: string | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      apiKey = authHeader.replace("Bearer ", "");
    } else if (queryApiKey) {
      apiKey = queryApiKey;
    }
    
    if (!apiKey) {
      return NextResponse.json({ error: "Missing authentication. Provide Authorization header or ?apiKey= query param" }, { status: 401 });
    }
    
    // Validate Agent
    const agent = await prisma.agent.findUnique({ where: { apiKey } });
    if (!agent) {
      return NextResponse.json({ error: "Invalid Agent API Key" }, { status: 401 });
    }

    // Initialize the MCP Server and custom SSE Transport
    const sessionId = crypto.randomUUID();
    const transport = new NextSseTransport(sessionId);
    
    const server = createMcpServer(apiKey);
    await server.connect(transport);
    
    activeSessions.set(sessionId, transport);
    
    // Cleanup on close
    transport.onclose = () => {
      activeSessions.delete(sessionId);
    };

    // The endpoint Claude should POST to
    // We construct an absolute URL pointing back to our own server's POST endpoint
    const postEndpoint = `${url.origin}/api/mcp/sse?sessionId=${sessionId}`;
    
    const stream = transport.createStream(postEndpoint);
    
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (error: any) {
    console.error("MCP SSE Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");
    
    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const transport = activeSessions.get(sessionId);
    if (!transport) {
      return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
    }

    // Parse the JSON-RPC message
    const body = await req.json();
    
    // The message could be a single JSON object or an array of objects (batch)
    // Actually, Claude usually sends a single object, but we can handle both.
    // For simplicity, we just pass it to the transport which expects JSONRPCMessage.
    // If it's an array, we should ideally iterate, but MCP spec mostly focuses on single messages.
    transport.handlePostMessage(body);

    return new Response("Accepted", { status: 202 });
  } catch (error: any) {
    console.error("MCP POST Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
