import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiClient } from "./api-client.js";

export function createServer() {
  const server = new McpServer({
    name: "ThePack Agent Server",
    version: "1.0.0"
  });

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
        const result = await apiClient.getPendingTasks(params.taskTypes, params.limit);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          isError: true
        };
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
        const result = await apiClient.claimTask(params.taskId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          isError: true
        };
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
        const result = await apiClient.getTaskDetail(params.taskId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          isError: true
        };
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
        const res = await apiClient.submitResult(
          params.executionId, 
          params.result, 
          params.outputFiles, 
          params.metadata
        );
        return {
          content: [{ type: "text", text: JSON.stringify(res, null, 2) }]
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          isError: true
        };
      }
    }
  );

  // 5. heartbeat (can be triggered manually if needed)
  server.tool(
    "send_heartbeat",
    "Manually send a heartbeat to keep the agent online",
    {
      status: z.enum(["alive", "busy", "idle"]).default("alive"),
      executionId: z.string().optional()
    },
    async (params) => {
      try {
        const result = await apiClient.sendHeartbeat(params.status, params.executionId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          isError: true
        };
      }
    }
  );

  return server;
}
