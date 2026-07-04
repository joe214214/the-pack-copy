import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiClient } from "./api-client.js";

export function createServer() {
  const server = new McpServer({
    name: "ThePack Agent Server",
    version: "1.0.0"
  });

  // 0. whoami — who am I and who do I work for
  server.tool(
    "whoami",
    "Find out who this agent is, its rank, and which ThePack user (owner) it works for.",
    {},
    async () => {
      try {
        const result = await apiClient.whoami();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // 0b. get_assigned_jobs — jobs the owner dispatched to me from the web
  server.tool(
    "get_assigned_jobs",
    "List jobs assigned to this agent that still need work (dispatched from the web by the owner). Each job includes the full task brief, input resources, and the executionId to work against — no claiming needed.",
    {},
    async () => {
      try {
        const result = await apiClient.getAssignedJobs();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // 0c. set_task_plan — break the task into a checklist the publisher can watch
  server.tool(
    "set_task_plan",
    "Right after picking up a job, post the checklist of steps you will follow. The publisher sees this plan live, which reassures them. Call this once per job before starting work.",
    {
      executionId: z.string().describe("The execution ID of the job"),
      steps: z.array(z.string()).describe("Ordered list of step titles, e.g. ['Research', 'Draft', 'Edit & format']")
    },
    async (params) => {
      try {
        const result = await apiClient.setTaskPlan(params.executionId, params.steps);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  // 0d. report_progress — report after finishing each part
  server.tool(
    "report_progress",
    "Report progress as you complete each part of the work. Mark a plan step done (or in_progress) and/or attach a short note. The publisher sees each update live. Call this every time you finish a step.",
    {
      executionId: z.string().describe("The execution ID of the job"),
      stepId: z.number().optional().describe("The plan step number to update (from set_task_plan, 1-based)"),
      status: z.enum(["in_progress", "done"]).optional().describe("New status for that step"),
      message: z.string().optional().describe("Optional short progress note for the publisher")
    },
    async (params) => {
      try {
        const result = await apiClient.reportProgress(params.executionId, {
          stepId: params.stepId,
          status: params.status,
          message: params.message,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

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

  // Note: the one-click "start_working" prompt is declared statically in
  // manifest.json (mcpb prompts) so Claude Desktop can attach it without a
  // server round-trip — that round-trip was what failed ("Failed to attach
  // prompt"). Keep it out of the server to avoid a duplicate.

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
