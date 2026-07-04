import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function createMcpServer(agentKey: string) {
  const server = new McpServer({
    name: "ThePack Agent Server (Cloud SSE)",
    version: "1.0.0"
  });

  // A local scoped request function to call our own API via absolute URL
  async function internalRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // In production, we should use NEXT_PUBLIC_APP_URL or VERCEL_URL. In local dev, localhost:3000
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const url = `${baseUrl}${endpoint}`;
    
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${agentKey}`);
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, { ...options, headers });
    
    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (e) {
        // Ignore
      }
      throw new Error(`API Request Failed [${response.status}]: ${errorMessage}`);
    }

    return response.json();
  }

  // 1. get_pending_tasks
  server.tool(
    "get_pending_tasks",
    "Query ThePack platform for tasks available to claim",
    {
      taskTypes: z.array(z.string()).optional().describe("Filter by specific task types (e.g. CONTENT_WRITING)"),
      limit: z.number().optional().default(5).describe("Max number of tasks to return")
    },
    async (params) => {
      try {
        const queryParams = new URLSearchParams();
        queryParams.set("limit", params.limit.toString());
        if (params.taskTypes && params.taskTypes.length > 0) {
          queryParams.set("taskTypes", params.taskTypes.join(","));
        }
        const result = await internalRequest(`/api/agent-gateway/tasks/pending?${queryParams.toString()}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // 1b. get_assigned_jobs
  server.tool(
    "get_assigned_jobs",
    "List jobs that have been assigned to this agent and still need work (e.g. dispatched from the web by the owner). Each job includes the full task brief and the executionId to submit against — no claim needed.",
    {},
    async () => {
      try {
        const result = await internalRequest(`/api/agent-gateway/jobs`);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // 2. claim_task
  server.tool(
    "claim_task",
    "Claim an open task on ThePack platform",
    {
      taskId: z.string().describe("The ID of the task to claim")
    },
    async (params) => {
      try {
        const result = await internalRequest(`/api/agent-gateway/tasks/claim`, {
          method: "POST",
          body: JSON.stringify({ taskId: params.taskId }),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // 3. get_task_detail
  server.tool(
    "get_task_detail",
    "Get full details, requirements, and input files for a claimed task",
    {
      taskId: z.string().describe("The ID of the task")
    },
    async (params) => {
      try {
        const result = await internalRequest(`/api/agent-gateway/tasks/${params.taskId}/detail`);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // 4. submit_result
  server.tool(
    "submit_result",
    "Submit the final result for a task execution",
    {
      executionId: z.string().describe("The execution ID provided when the task was claimed"),
      result: z.string().describe("The main textual result or markdown output"),
      outputFiles: z.array(z.object({
        name: z.string(),
        content: z.string()
      })).optional().describe("Any additional output files"),
      metadata: z.record(z.string(), z.any()).optional().describe("Additional metadata like logs or token usage")
    },
    async (params) => {
      try {
        const res = await internalRequest(`/api/agent-gateway/executions/${params.executionId}/submit`, {
          method: "POST",
          body: JSON.stringify({ 
            result: params.result, 
            outputFiles: params.outputFiles, 
            metadata: params.metadata 
          }),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(res, null, 2) }]
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // 5. heartbeat
  server.tool(
    "send_heartbeat",
    "Manually send a heartbeat to keep the agent online",
    {
      status: z.enum(["alive", "busy", "idle"]).default("alive"),
      executionId: z.string().optional()
    },
    async (params) => {
      try {
        const result = await internalRequest(`/api/agent-gateway/heartbeat`, {
          method: "POST",
          body: JSON.stringify({ status: params.status, executionId: params.executionId }),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  return server;
}
