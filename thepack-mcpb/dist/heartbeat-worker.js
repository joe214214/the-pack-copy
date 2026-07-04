import { apiClient } from "./api-client.js";
export function startHeartbeatWorker(intervalMs = 30000) {
    // Send first heartbeat immediately
    apiClient.sendHeartbeat("alive")
        .then(() => console.error("[ThePack MCP] Heartbeat started"))
        .catch(e => console.error("[ThePack MCP] Heartbeat failed:", e.message));
    return setInterval(async () => {
        try {
            await apiClient.sendHeartbeat("alive");
        }
        catch (error) {
            console.error("[ThePack MCP] Heartbeat failed:", error.message);
        }
    }, intervalMs);
}
