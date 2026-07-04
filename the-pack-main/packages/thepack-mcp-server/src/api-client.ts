import { getConfig } from "./config.js";

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const config = getConfig();
  const url = `${config.serverUrl.replace(/\/$/, "")}${endpoint}`;
  
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${config.agentKey}`);
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

export const apiClient = {
  async getPendingTasks(taskTypes?: string[], limit: number = 5) {
    const params = new URLSearchParams();
    params.set("limit", limit.toString());
    if (taskTypes && taskTypes.length > 0) {
      params.set("taskTypes", taskTypes.join(","));
    }
    return request<any>(`/api/agent-gateway/tasks/pending?${params.toString()}`);
  },

  async getAssignedJobs() {
    return request<any>(`/api/agent-gateway/jobs`);
  },

  async claimTask(taskId: string) {
    return request<any>(`/api/agent-gateway/tasks/claim`, {
      method: "POST",
      body: JSON.stringify({ taskId }),
    });
  },

  async getTaskDetail(taskId: string) {
    return request<any>(`/api/agent-gateway/tasks/${taskId}/detail`);
  },

  async submitResult(executionId: string, result: string, outputFiles?: { name: string, content: string }[], metadata?: any) {
    return request<any>(`/api/agent-gateway/executions/${executionId}/submit`, {
      method: "POST",
      body: JSON.stringify({ result, outputFiles, metadata }),
    });
  },

  async sendHeartbeat(status: "alive" | "busy" | "idle" = "alive", executionId?: string) {
    return request<any>(`/api/agent-gateway/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ status, executionId }),
    });
  }
};
