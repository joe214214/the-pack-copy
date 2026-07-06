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
  async whoami() {
    return request<any>(`/api/agent-gateway/whoami`);
  },

  async getAssignedJobs() {
    return request<any>(`/api/agent-gateway/jobs`);
  },

  async getInputFile(fileId: string) {
    return request<any>(`/api/agent-gateway/files/${fileId}`);
  },

  async setTaskPlan(executionId: string, steps: string[]) {
    return request<any>(`/api/agent-gateway/executions/${executionId}/plan`, {
      method: "POST",
      body: JSON.stringify({ steps }),
    });
  },

  async reportProgress(executionId: string, opts: { stepId?: number; status?: "in_progress" | "done"; message?: string }) {
    return request<any>(`/api/agent-gateway/executions/${executionId}/progress`, {
      method: "POST",
      body: JSON.stringify(opts),
    });
  },

  async getPendingTasks(taskTypes?: string[], limit: number = 5) {
    const params = new URLSearchParams();
    params.set("limit", limit.toString());
    if (taskTypes && taskTypes.length > 0) {
      params.set("taskTypes", taskTypes.join(","));
    }
    return request<any>(`/api/agent-gateway/tasks/pending?${params.toString()}`);
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

  async submitResult(executionId: string, result: string, outputFiles?: { name: string, content: string, contentType?: string, encoding?: string }[], metadata?: any, fileIds?: string[]) {
    return request<any>(`/api/agent-gateway/executions/${executionId}/submit`, {
      method: "POST",
      body: JSON.stringify({ result, outputFiles, metadata, fileIds }),
    });
  },

  async uploadFile(executionId: string, filename: string, base64Content: string, contentType: string) {
    // Upload a file to storage and get back a fileId.
    // Uses the agent-gateway file upload endpoint (Bearer auth).
    const config = getConfig();
    const url = `${config.serverUrl.replace(/\/$/, "")}/api/agent-gateway/files/upload`;

    // Convert base64 to Uint8Array for the FormData blob
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: contentType });
    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("executionId", executionId);

    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.agentKey}` },
      body: formData,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`Upload failed [${response.status}]: ${err.error || response.statusText}`);
    }
    return response.json();
  },

  async sendHeartbeat(status: "alive" | "busy" | "idle" = "alive", executionId?: string) {
    return request<any>(`/api/agent-gateway/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ status, executionId }),
    });
  }
};
