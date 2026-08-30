import { getConfig } from "./config.js";
async function request(endpoint, options = {}) {
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
        }
        catch (e) {
            // Ignore
        }
        throw new Error(`API Request Failed [${response.status}]: ${errorMessage}`);
    }
    return response.json();
}
export const apiClient = {
    async whoami() {
        return request(`/api/agent-gateway/whoami`);
    },
    async getAssignedJobs() {
        return request(`/api/agent-gateway/jobs`);
    },
    async getInputFile(fileId) {
        return request(`/api/agent-gateway/files/${fileId}`);
    },
    // Download an input attachment's raw bytes and write them into `destDir`,
    // returning the local path. Keeps large binaries OUT of the model's context —
    // Claude opens the file by path (mirrors the filePath upload on the way out).
    async downloadInputFile(fileId, destDir) {
        const config = getConfig();
        const url = `${config.serverUrl.replace(/\/$/, "")}/api/agent-gateway/files/${fileId}?raw=1`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${config.agentKey}` } });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(`Download failed [${res.status}]: ${err.error || res.statusText}`);
        }
        const contentType = (res.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
        const cd = res.headers.get("content-disposition") || "";
        const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^"]+)"?/i);
        const rawName = m ? decodeURIComponent(m[1]) : `input-${fileId}`;
        const safeName = rawName.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "") || `input-${fileId}`;
        const buf = Buffer.from(await res.arrayBuffer());
        const { writeFileSync, mkdirSync } = await import("node:fs");
        const path = await import("node:path");
        mkdirSync(destDir, { recursive: true });
        const filePath = path.join(destDir, safeName);
        writeFileSync(filePath, buf);
        return { filePath, filename: safeName, contentType, size: buf.length };
    },
    async setTaskPlan(executionId, steps) {
        return request(`/api/agent-gateway/executions/${executionId}/plan`, {
            method: "POST",
            body: JSON.stringify({ steps }),
        });
    },
    async reportProgress(executionId, opts) {
        return request(`/api/agent-gateway/executions/${executionId}/progress`, {
            method: "POST",
            body: JSON.stringify(opts),
        });
    },
    async getPendingTasks(taskTypes, limit = 5) {
        const params = new URLSearchParams();
        params.set("limit", limit.toString());
        if (taskTypes && taskTypes.length > 0) {
            params.set("taskTypes", taskTypes.join(","));
        }
        return request(`/api/agent-gateway/tasks/pending?${params.toString()}`);
    },
    async claimTask(taskId) {
        return request(`/api/agent-gateway/tasks/claim`, {
            method: "POST",
            body: JSON.stringify({ taskId }),
        });
    },
    async getTaskDetail(taskId) {
        return request(`/api/agent-gateway/tasks/${taskId}/detail`);
    },
    async getRevisionFeedback(executionId) {
        return request(`/api/agent-gateway/executions/${executionId}/revision-feedback`);
    },
    async submitResult(executionId, result, outputFiles, metadata, fileIds) {
        return request(`/api/agent-gateway/executions/${executionId}/submit`, {
            method: "POST",
            body: JSON.stringify({ result, outputFiles, metadata, fileIds }),
        });
    },
    async uploadFile(executionId, filename, base64Content, contentType, sourceUrl, filePath) {
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
            let bytes;
            try {
                bytes = readFileSync(filePath);
            }
            catch (e) {
                throw new Error(`Cannot read filePath "${filePath}": ${e.message}`);
            }
            const blob = new Blob([new Uint8Array(bytes)], { type: contentType });
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
    async sendHeartbeat(status = "alive", executionId) {
        return request(`/api/agent-gateway/heartbeat`, {
            method: "POST",
            body: JSON.stringify({ status, executionId }),
        });
    }
};
