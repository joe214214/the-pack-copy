#!/usr/bin/env node
/**
 * ThePack Autonomous Runner
 * -------------------------
 * A standalone worker process. You only operate on the website (click "Assign"
 * to dispatch a task to your agent); this runner makes the agent do the rest by
 * itself — no manual chatting.
 *
 * Loop:
 *   1. Send a heartbeat (keeps the agent online).
 *   2. Poll GET /api/agent-gateway/jobs for work the website dispatched.
 *   3. When there is work, launch a headless `claude` (your local Claude Code)
 *      with the ThePack MCP tools wired in, and let it run the full job loop:
 *      whoami -> set_task_plan -> work + report_progress per step -> submit_result.
 *   4. Repeat.
 *
 * The "brain" is your own Claude Code (no separate API key, no extra cost).
 *
 * Usage:
 *   node dist/runner.js -k <agent_api_key> [-s http://localhost:3000] [-i 15]
 *
 * Requires the `claude` CLI on PATH. Set RUNNER_BYPASS=1 to use
 * --dangerously-skip-permissions instead of an explicit tool allowlist.
 */
import { Command } from "commander";
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const program = new Command();
program
    .name("thepack-runner")
    .description("Autonomous ThePack worker — polls for dispatched jobs and lets local Claude do them")
    .requiredOption("-k, --agent-key <key>", "Your agent's ThePack API key")
    .option("-s, --server-url <url>", "ThePack server URL", "http://localhost:3000")
    .option("-i, --interval <seconds>", "Poll interval in seconds", "15")
    .parse(process.argv);
const opts = program.opts();
const agentKey = opts.agentKey;
const serverUrl = String(opts.serverUrl).replace(/\/$/, "");
const pollMs = Math.max(5, parseInt(opts.interval, 10) || 15) * 1000;
const THEPACK_TOOLS = [
    "mcp__thepack__whoami",
    "mcp__thepack__get_assigned_jobs",
    "mcp__thepack__set_task_plan",
    "mcp__thepack__report_progress",
    "mcp__thepack__submit_result",
];
const WORK_PROMPT = [
    "You are a ThePack autonomous worker. Right now, without asking me any questions, do the following:",
    "1. Call mcp__thepack__whoami to confirm who you are and who you work for.",
    "2. Call mcp__thepack__get_assigned_jobs to list jobs dispatched to you. If there are none, stop.",
    "3. For EACH job:",
    "   a. Read the full task brief and any input resources.",
    "   b. Call mcp__thepack__set_task_plan with an ordered checklist of 3-6 short step titles.",
    "   c. Do the work step by step. After finishing each step, call mcp__thepack__report_progress with that step's id and status \"done\" plus a one-line note (so the publisher sees live progress).",
    "   d. When the whole deliverable is ready, call mcp__thepack__submit_result with the job's executionId and the complete result as markdown.",
    "4. When every job is submitted, stop and briefly summarize what you delivered.",
    "Only use the mcp__thepack__* tools. Produce real, high-quality work that fully meets each task's requirements and output format.",
].join("\n");
// Build a temporary MCP config that points Claude at the ThePack MCP server
// (this same package's compiled entry), carrying the agent key.
const mcpEntry = path.join(__dirname, "index.js");
const cfgDir = mkdtempSync(path.join(tmpdir(), "thepack-runner-"));
const cfgPath = path.join(cfgDir, "mcp.json");
writeFileSync(cfgPath, JSON.stringify({
    mcpServers: {
        thepack: { command: "node", args: [mcpEntry, "-k", agentKey, "-s", serverUrl] },
    },
}));
function log(msg) {
    console.log(`[runner ${new Date().toLocaleTimeString()}] ${msg}`);
}
async function api(endpoint, init) {
    const res = await fetch(`${serverUrl}${endpoint}`, {
        ...init,
        headers: { Authorization: `Bearer ${agentKey}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    if (!res.ok)
        throw new Error(`${endpoint} -> ${res.status}`);
    return res.json();
}
let busy = false;
function runClaude() {
    return new Promise((resolve) => {
        const bypass = process.env.RUNNER_BYPASS === "1";
        const args = ["-p", "--mcp-config", cfgPath, "--strict-mcp-config", "--output-format", "text"];
        if (bypass) {
            args.push("--dangerously-skip-permissions");
        }
        else {
            args.push("--allowedTools", ...THEPACK_TOOLS);
        }
        // shell:true so Windows resolves the `claude` shim; prompt goes via stdin to
        // avoid any quoting issues with the long multi-line instruction.
        const quoted = args
            .map((a) => (a.includes(" ") || a.includes("\\") ? `"${a}"` : a))
            .join(" ");
        const child = spawn(`claude ${quoted}`, { shell: true });
        child.stdin.write(WORK_PROMPT);
        child.stdin.end();
        child.stdout.on("data", (d) => process.stdout.write(d));
        child.stderr.on("data", (d) => process.stderr.write(d));
        child.on("close", (code) => {
            log(`claude finished (exit ${code})`);
            resolve();
        });
        child.on("error", (e) => {
            log(`failed to launch claude: ${e.message}. Is the 'claude' CLI on PATH?`);
            resolve();
        });
    });
}
async function tick() {
    try {
        await api("/api/agent-gateway/heartbeat", { method: "POST", body: JSON.stringify({ status: "alive" }) });
    }
    catch (e) {
        log(`heartbeat failed: ${e.message}`);
    }
    if (busy)
        return;
    try {
        const data = await api("/api/agent-gateway/jobs");
        const count = data.count ?? (data.jobs?.length || 0);
        if (count > 0) {
            log(`${count} job(s) dispatched — handing off to local Claude…`);
            busy = true;
            await runClaude();
            busy = false;
        }
    }
    catch (e) {
        busy = false;
        log(`poll failed: ${e.message}`);
    }
}
log(`ThePack runner started. server=${serverUrl} poll=${pollMs / 1000}s`);
log(`Brain: local 'claude' CLI (${process.env.RUNNER_BYPASS === "1" ? "bypass perms" : "thepack tools only"}).`);
log("Leave this running. Assign tasks to this agent on the website — they'll be handled automatically.");
void tick();
setInterval(() => void tick(), pollMs);
