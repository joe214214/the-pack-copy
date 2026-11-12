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

/**
 * Upload a deliverable straight to storage via a signed URL (platform issues
 * the URL + verifies afterwards; bytes skip the platform, so no ~4.5 MB cap
 * from serverless hosting). Returns null when the platform predates this
 * endpoint (404), so the caller falls back to the multipart route.
 */
async function uploadDirect(
  executionId: string, filename: string, bytes: Buffer, contentType: string
): Promise<any | null> {
  const config = getConfig();
  const base = `${config.serverUrl.replace(/\/$/, "")}/api/agent-gateway/files`;
  const auth = { Authorization: `Bearer ${config.agentKey}`, "Content-Type": "application/json" };

  const prepRes = await fetch(`${base}/upload-url`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ executionId, filename, contentType, size: bytes.length }),
  });
  if (prepRes.status === 404 || prepRes.status === 405) {
    const body = await prepRes.json().catch(() => null);
    // 404 with a JSON error is a real "execution not found", not a missing route.
    if (!body?.error) return null;
    throw new Error(`Upload failed [${prepRes.status}]: ${body.error}`);
  }
  if (!prepRes.ok) {
    const err = await prepRes.json().catch(() => ({ error: prepRes.statusText }));
    throw new Error(`Upload failed [${prepRes.status}]: ${err.error || prepRes.statusText}`);
  }
  const prep = await prepRes.json();

  const put = await fetch(prep.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": prep.contentType, "x-upsert": "false" },
    body: new Uint8Array(bytes),
  });
  if (!put.ok) {
    const detail = await put.text().catch(() => "");
    throw new Error(`Upload to storage failed [${put.status}]: ${detail.slice(0, 200)}`);
  }

  const doneRes = await fetch(`${base}/complete`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ ticket: prep.ticket }),
  });
  if (!doneRes.ok) {
    const err = await doneRes.json().catch(() => ({ error: doneRes.statusText }));
    throw new Error(`Upload failed [${doneRes.status}]: ${err.error || doneRes.statusText}`);
  }
  return doneRes.json();
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

  // Download an input attachment's raw bytes and write them into `destDir`,
  // returning the local path. Keeps large binaries OUT of the model's context —
  // Claude opens the file by path (mirrors the filePath upload on the way out).
  async downloadInputFile(fileId: string, destDir: string) {
    const config = getConfig();
    const base = `${config.serverUrl.replace(/\/$/, "")}/api/agent-gateway/files/${fileId}`;
    const auth = { Authorization: `Bearer ${config.agentKey}` };

    // Preferred: ask for a short-lived direct storage URL and download from
    // there WITHOUT our key — no size cap from the platform's hosting. Older
    // servers ignore ?signed=1 and answer with inline JSON (no `url`), in
    // which case we fall back to ?raw=1.
    let res: Response | null = null;
    let signedMeta: { filename?: string; contentType?: string } = {};
    const probe = await fetch(`${base}?signed=1`, { headers: auth });
    if (probe.ok) {
      const meta = await probe.json().catch(() => null);
      if (meta && typeof meta.url === "string") {
        signedMeta = meta;
        res = await fetch(meta.url);
      }
    }
    if (!res) res = await fetch(`${base}?raw=1`, { headers: auth });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res!.statusText }));
      throw new Error(`Download failed [${res.status}]: ${err.error || err.message || res.statusText}`);
    }
    const contentType = (signedMeta.contentType || res.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
    const cd = res.headers.get("content-disposition") || "";
    const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^"]+)"?/i);
    const rawName = signedMeta.filename || (m ? decodeURIComponent(m[1]) : `input-${fileId}`);
    const safeName = rawName.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "") || `input-${fileId}`;
    const buf = Buffer.from(await res.arrayBuffer());
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const path = await import("node:path");
    mkdirSync(destDir, { recursive: true });
    const filePath = path.join(destDir, safeName);
    writeFileSync(filePath, buf);
    return { filePath, filename: safeName, contentType, size: buf.length };
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

  async getRevisionFeedback(executionId: string) {
    return request<any>(`/api/agent-gateway/executions/${executionId}/revision-feedback`);
  },

  async submitResult(executionId: string, result: string, outputFiles?: { name: string, content: string, contentType?: string, encoding?: string }[], metadata?: any, fileIds?: string[]) {
    return request<any>(`/api/agent-gateway/executions/${executionId}/submit`, {
      method: "POST",
      body: JSON.stringify({ result, outputFiles, metadata, fileIds }),
    });
  },

  async uploadFile(
    executionId: string,
    filename: string,
    base64Content: string,
    contentType: string,
    sourceUrl?: string,
    filePath?: string
  ) {
    // Upload a file to storage and get back a fileId.
    // Uses the agent-gateway file upload endpoint (Bearer auth).
    const config = getConfig();
    const url = `${config.serverUrl.replace(/\/$/, "")}/api/agent-gateway/files/upload`;

    // Preferred for LOCALLY produced files of any size: this MCP server runs on
    // the same machine as the model's workspace, so it can read the file from
    // disk and stream it up as multipart — zero bytes through the model. This
    // is what makes large deliverables (multi-MB images, PDFs, …) practical.
    if (filePath) {
      const { readFileSync } = await import("node:fs");
      let bytes: Buffer;
      try {
        bytes = readFileSync(filePath);
      } catch (e: any) {
        throw new Error(`Cannot read filePath "${filePath}": ${e.message}`);
      }
      const blob = new Blob([new Uint8Array(bytes)], { type: contentType });
      const direct = await uploadDirect(executionId, filename, bytes, contentType);
      if (direct) return direct;
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
    }

    // Preferred for tool-produced files (e.g. Figma screenshots): hand the
    // server a URL and let IT download the bytes — no multi-KB base64 through
    // the model.
    if (sourceUrl) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.agentKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ executionId, filename, sourceUrl, contentType }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(`Upload failed [${response.status}]: ${err.error || response.statusText}`);
      }
      return response.json();
    }

    // Convert base64 to Uint8Array for the FormData blob
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: contentType });
    const direct = await uploadDirect(executionId, filename, Buffer.from(bytes), contentType);
    if (direct) return direct;
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
