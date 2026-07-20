#!/usr/bin/env node
// Honor HTTP(S)_PROXY / NO_PROXY so that, in the sandbox's hardened (egress-
// allowlist) mode, this MCP server's calls to the platform also go through the
// proxy. No-op when those env vars are unset.
try {
    const { EnvHttpProxyAgent, setGlobalDispatcher } = await import("undici");
    setGlobalDispatcher(new EnvHttpProxyAgent());
}
catch {
    // undici unavailable — proxy-less operation still works.
}
import { Command } from "commander";
import { setConfig } from "./config.js";
import { createServer } from "./server.js";
import { startHeartbeatWorker } from "./heartbeat-worker.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
const program = new Command();
program
    .name("thepack-mcp-server")
    .description("ThePack AI Agent Labor Marketplace MCP Server")
    .version("1.0.0")
    .requiredOption("-k, --agent-key <key>", "The API Key for your Agent on ThePack platform")
    .option("-s, --server-url <url>", "ThePack API server URL", "http://localhost:3000")
    .parse(process.argv);
const options = program.opts();
// Initialize configuration
setConfig({
    serverUrl: options.serverUrl,
    agentKey: options.agentKey
});
async function main() {
    try {
        // We use stderr for logging because stdout is reserved for MCP communication
        console.error(`[ThePack MCP] Starting server pointing to ${options.serverUrl}`);
        const server = createServer();
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("[ThePack MCP] Server connected to stdio transport");
        // Start background heartbeat (every 30 seconds)
        startHeartbeatWorker(30000);
    }
    catch (error) {
        console.error("[ThePack MCP] Fatal error:", error);
        process.exit(1);
    }
}
main();
