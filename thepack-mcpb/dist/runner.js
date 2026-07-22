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
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Honor HTTP(S)_PROXY / NO_PROXY for our own fetch calls, so the egress-allowlist
// proxy (sandbox hardened mode) also governs the runner's platform traffic.
// No-op when those env vars are unset. Child `claude` inherits the same env.
try {
    const { EnvHttpProxyAgent, setGlobalDispatcher } = await import("undici");
    setGlobalDispatcher(new EnvHttpProxyAgent());
}
catch {
    // undici not available (older Node) — proxy-less operation still works.
}
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
    "mcp__thepack__get_input_file",
    "mcp__thepack__set_task_plan",
    "mcp__thepack__report_progress",
    "mcp__thepack__submit_result",
    "mcp__thepack__upload_file",
    "mcp__thepack__submit_image_result",
];
// Claude Code's built-in local tools — ALWAYS allowed. The worker needs its
// hands (shell for Pillow/ffmpeg/…, file IO, web lookup) for real work; the
// owner-approval gate applies ONLY to account connectors (see below).
const LOCAL_TOOLS = [
    "Bash",
    "Read",
    "Write",
    "Edit",
    "Glob",
    "Grep",
    "WebFetch",
    "WebSearch",
    "TodoWrite",
    "NotebookEdit",
];
const WORK_PROMPT = [
    "You are a ThePack autonomous worker. Right now, without asking me any questions, do the following:",
    "1. Call mcp__thepack__whoami to confirm who you are and who you work for.",
    "2. Call mcp__thepack__get_assigned_jobs to list jobs dispatched to you. If there are none, stop.",
    "3. For EACH job:",
    "   a. Read the full task brief. If the job has inputFiles, call mcp__thepack__get_input_file(fileId) for each — it DOWNLOADS the file into your working directory and returns its filePath; open that path directly with your tools (e.g. Pillow for images). Do not ask for base64.",
    "   b. Call mcp__thepack__set_task_plan with an ordered checklist of 3-6 short step titles.",
    "   c. Do the work step by step. After finishing each step, call mcp__thepack__report_progress with that step's id and status \"done\" plus a one-line note (so the publisher sees live progress).",
    "   d. Deliver in the exact form the task asks for. READ the task's outputFormat and description and pick the matching method — the publisher's stated output format wins over the task type:",
    "      - TEXT / markdown / or a link is requested: call mcp__thepack__submit_result with the executionId and the complete result as markdown (put any URL, e.g. a Figma link, inside the markdown).",
    "      - AN IMAGE is requested (the brief/outputFormat says image, PNG, screenshot, 'as an image', a picture, a mockup rendered as an image, or the task type is IMAGE_GENERATION / IMAGE_EDITING): deliver an actual image file via mcp__thepack__upload_file then mcp__thepack__submit_image_result(executionId, fileIds=[the returned id], result note).",
    "         · If you produced the file LOCALLY (Pillow, ffmpeg, any script — the normal case): call mcp__thepack__upload_file(executionId, filename, contentType, filePath=<ABSOLUTE path of the file in your workspace>). The upload server reads it from disk — works for any size. NEVER paste large base64.",
    "         · If the image should be a Figma / FigJam design: FIRST create it with the Figma tools (mcp__claude_ai_Figma__generate_diagram for a flowchart/diagram, or use_figma for a design). THEN render it with mcp__claude_ai_Figma__get_screenshot, passing fileKey (extracted from the board/design URL) and nodeId \"0:1\" (the whole board). get_screenshot returns an image_url — DO NOT set enableBase64Response and DO NOT paste base64. Instead call mcp__thepack__upload_file(executionId, filename='design.png', contentType='image/png', sourceUrl=<the image_url from get_screenshot>) — the ThePack server downloads the PNG itself. Then submit_image_result. Include the Figma link in your submit note too.",
    "         · base64Content is a last resort for tiny files (<100 KB) only.",
    "      - A WEB PAGE / UI / interactive component / HTML is requested (a page, widget, mockup you can actually open, or the brief mentions HTML/CSS/JS/a component): write ONE self-contained file (all CSS and JS INLINE in a single .html — no external files, no build step) to your working directory. You MUST deliver it as an UPLOADED FILE so the publisher can open the live page: (1) mcp__thepack__upload_file(executionId, filename='index.html', contentType='text/html', filePath=<ABSOLUTE path>) → returns a file id; (2) mcp__thepack__submit_result(executionId, result=<short description of what you built>, fileIds=[that id]). Do NOT inline the HTML into `result` or `outputFiles`, and do NOT rename it to .txt — it has to be an uploaded .html file. Use any relevant installed skills for design/interaction quality.",
    "4. When every job is submitted, stop and briefly summarize what you delivered.",
    "Prefer the mcp__thepack__* tools for all platform interaction. Produce real, high-quality work that fully meets each task's requirements and output format.",
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
// Which claude.ai connectors the worker is allowed to use (MCP server names).
// Seeded from ALLOWED_CONNECTORS (local override), otherwise refreshed from the
// owner's ticked list via whoami. See runClaude() for how this gates tools.
const envConnectors = (process.env.ALLOWED_CONNECTORS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
let approvedConnectors = envConnectors;
// ── Connector discovery ──────────────────────────────────────────────────────
// What connectors exist on this machine's Claude account (`claude mcp list`),
// reported to the platform via heartbeat so the website's Connectors checklist
// shows them (incl. ones newly added in Claude Desktop). Discovery ≠ approval:
// the owner still ticks which ones the agent may use.
let lastDiscoveryAt = 0;
const DISCOVER_EVERY_MS = 5 * 60 * 1000; // startup + every 5 min
function discoverConnectors() {
    return new Promise((resolve) => {
        const child = spawn("claude mcp list", { shell: true });
        let out = "";
        const timer = setTimeout(() => {
            try {
                child.kill();
            }
            catch { /* ignore */ }
        }, 60_000);
        child.stdout.on("data", (d) => (out += d));
        child.on("error", () => { clearTimeout(timer); resolve([]); });
        child.on("close", () => {
            clearTimeout(timer);
            const names = [];
            for (const line of out.split("\n")) {
                // e.g. "claude.ai Figma: https://mcp.figma.com/mcp - ✔ Connected"
                const m = line.match(/^([^:]+):\s+\S+.*\s-\s/);
                if (!m)
                    continue;
                const raw = m[1].trim();
                if (!raw || raw.toLowerCase() === "thepack")
                    continue; // our own server
                // normalize to the MCP tool-prefix form: "claude.ai Figma" -> "claude_ai_Figma"
                const norm = raw.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
                if (norm && !names.includes(norm))
                    names.push(norm);
            }
            resolve(names);
        });
    });
}
// Pull the owner-approved connector list from the platform. The env override,
// when set, wins (handy for local testing) and skips the network call.
async function refreshApprovedConnectors() {
    if (envConnectors.length > 0) {
        log(`connectors (env override): ${envConnectors.join(", ") || "none"}`);
        return;
    }
    try {
        const me = await api("/api/agent-gateway/whoami");
        const list = Array.isArray(me?.agent?.allowedConnectors) ? me.agent.allowedConnectors : [];
        approvedConnectors = list;
        log(`connectors approved by owner: ${list.length ? list.join(", ") : "none (fully isolated)"}`);
    }
    catch (e) {
        log(`could not fetch approved connectors: ${e.message} — staying isolated`);
    }
}
// Per-run scratch space. Each claude run gets a fresh empty working directory
// and it is deleted afterwards, so no files leak between jobs. In the sandbox
// container JOBS_DIR points at a tmpfs mount; on bare metal it defaults to the
// OS temp dir.
const jobsRoot = process.env.JOBS_DIR || tmpdir();
function runClaude() {
    return new Promise((resolve) => {
        const bypass = process.env.RUNNER_BYPASS === "1";
        // Owner-approved claude.ai connectors the worker may use, by MCP server name
        // (e.g. "claude_ai_Figma"). These come from what the owner ticked in ThePack
        // (fetched via whoami into `approvedConnectors`); ALLOWED_CONNECTORS env
        // overrides for local testing. When non-empty we drop --strict-mcp-config so
        // the account's connectors load, but the --allowedTools list below is the
        // security boundary: ONLY ThePack tools + these approved connectors are
        // callable, so every other connector on the account (brokerage, private
        // Drive, …) stays uninvokable even though it loaded. Empty => hard-isolated
        // (strict, ThePack tools only), unchanged from before.
        const allowedConnectors = approvedConnectors;
        const inheritConnectors = allowedConnectors.length > 0;
        const args = ["-p", "--mcp-config", cfgPath, "--output-format", "text"];
        if (!inheritConnectors)
            args.push("--strict-mcp-config");
        // Which model the rented agent thinks with. Unset => the account default.
        // Accepts an alias ("opus", "sonnet", "fable") or a full model name. Useful
        // both to control cost/latency and to make a skill's contribution visible:
        // a strong model already knows a lot, so a skill adds little on top of it.
        const model = (process.env.CLAUDE_MODEL || "").trim();
        if (model)
            args.push("--model", model);
        if (bypass && !inheritConnectors) {
            // Sandbox full-power mode with no connectors loaded: skip perms entirely.
            args.push("--dangerously-skip-permissions");
        }
        else {
            // Allowlist mode: local tools are ALWAYS in (Pillow via Bash, file IO, …);
            // the list is the wall only for CONNECTORS — un-approved connectors load
            // but stay uninvokable, so we never bypass perms here.
            const connectorTools = allowedConnectors.map((c) => `mcp__${c}`);
            args.push("--allowedTools", ...LOCAL_TOOLS, ...THEPACK_TOOLS, ...connectorTools);
        }
        const workDir = mkdtempSync(path.join(jobsRoot, "job-"));
        // shell:true so Windows resolves the `claude` shim; prompt goes via stdin to
        // avoid any quoting issues with the long multi-line instruction. cwd is the
        // isolated per-run workspace.
        const quoted = args
            .map((a) => (a.includes(" ") || a.includes("\\") ? `"${a}"` : a))
            .join(" ");
        // detached on POSIX so the child is a process-group leader — lets the
        // watchdog kill the WHOLE tree (shell + claude + any grandchild) on timeout.
        const isWin = process.platform === "win32";
        const child = spawn(`claude ${quoted}`, { shell: true, cwd: workDir, detached: !isWin });
        // resolve() must fire exactly once — close, error, AND the watchdog can race.
        let settled = false;
        const finish = (msg) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(watchdog);
            if (msg)
                log(msg);
            try {
                rmSync(workDir, { recursive: true, force: true });
            }
            catch { /* best effort */ }
            resolve();
        };
        // Watchdog: a claude run can HANG indefinitely (e.g. a stalled API response
        // stream that never errors or closes). Without this the promise never
        // resolves, `busy` stays true forever, and the runner silently stops taking
        // work. Kill it after CLAUDE_TIMEOUT_MIN and let the loop retry the job.
        const timeoutMs = Math.max(1, parseInt(process.env.CLAUDE_TIMEOUT_MIN || "15", 10) || 15) * 60_000;
        const watchdog = setTimeout(() => {
            log(`claude exceeded ${Math.round(timeoutMs / 60000)} min with no exit — killing (likely a stalled network stream); the job will be retried`);
            try {
                if (!isWin && child.pid)
                    process.kill(-child.pid, "SIGKILL"); // whole group
                else
                    child.kill("SIGKILL");
            }
            catch {
                try {
                    child.kill("SIGKILL");
                }
                catch { /* already gone */ }
            }
            finish();
        }, timeoutMs);
        child.stdin.write(WORK_PROMPT);
        child.stdin.end();
        child.stdout.on("data", (d) => process.stdout.write(d));
        child.stderr.on("data", (d) => process.stderr.write(d));
        child.on("close", (code) => finish(`claude finished (exit ${code})`));
        child.on("error", (e) => finish(`failed to launch claude: ${e.message}. Is the 'claude' CLI on PATH?`));
    });
}
async function tick() {
    // Periodically (startup + every 5 min) re-discover the account's connectors
    // and piggyback them on the heartbeat so the website checklist stays fresh.
    let discovered;
    if (Date.now() - lastDiscoveryAt > DISCOVER_EVERY_MS) {
        lastDiscoveryAt = Date.now();
        discovered = await discoverConnectors();
        log(`connectors on this Claude account: ${discovered.length ? discovered.join(", ") : "none found"}`);
    }
    try {
        await api("/api/agent-gateway/heartbeat", {
            method: "POST",
            body: JSON.stringify({ status: "alive", ...(discovered ? { connectors: discovered } : {}) }),
        });
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
            // Re-read the owner's approved connectors so a change on the website takes
            // effect on the next job without restarting the runner.
            await refreshApprovedConnectors();
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
log(`Brain: local 'claude' CLI, model=${process.env.CLAUDE_MODEL?.trim() || "account default"} (${process.env.RUNNER_BYPASS === "1" ? "bypass perms" : "local tools + ThePack tools"}; connectors gated by owner approval).`);
log("Leave this running. Assign tasks to this agent on the website — they'll be handled automatically.");
void refreshApprovedConnectors();
void tick();
setInterval(() => void tick(), pollMs);
