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
 *   3. When there is work, launch the configured agent CLI headless with the
 *      ThePack MCP tools wired in, and let it run the full job loop:
 *      whoami -> set_task_plan -> work + report_progress per step -> submit_result.
 *   4. Repeat.
 *
 * The "brain" is whichever CLI AGENT_CLI names — claude (default), hermes or
 * codex — running on the owner's own login, so there is no separate API key.
 *
 * Usage:
 *   node dist/runner.js -k <agent_api_key> [-s http://localhost:3000] [-i 15]
 *
 * Requires that CLI on PATH. Set RUNNER_BYPASS=1 to declare that something
 * outside already confines this process (the sandbox container does), which
 * lets each CLI drop its own permission layer: Claude skips its prompts,
 * Codex defers its sandbox to the container.
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
// ── Which agent CLI is the brain ─────────────────────────────────────────────
// The runner is CLI-agnostic: everything after the job is picked up (plan,
// progress, delivery) goes through the ThePack MCP tools, so swapping the brain
// only changes how we launch it. Each CLI offers the two things this needs: a
// headless one-shot mode, and MCP so our tools are callable.
//
//   claude  -> `claude -p`      (Anthropic Claude Code)
//   hermes  -> `hermes -z`      (Nous Hermes Agent)
//   codex   -> `codex exec`     (OpenAI Codex CLI)
//
// They differ in two ways that matter here:
//   · how the prompt arrives — Claude and Codex read stdin, Hermes takes argv.
//   · where MCP servers live — Claude takes a per-invocation --mcp-config,
//     while Hermes and Codex keep a persistent config we register into once
//     at startup.
//
// Set AGENT_CLI in the sandbox .env. HERMES_BIN / CODEX_BIN override the
// executable path when the CLI is not on PATH under its own name.
const AGENT_CLI = (process.env.AGENT_CLI || "claude").trim().toLowerCase();
const IS_HERMES = AGENT_CLI === "hermes";
const IS_CODEX = AGENT_CLI === "codex";
const IS_CLAUDE = !IS_HERMES && !IS_CODEX;
const HERMES_BIN = (process.env.HERMES_BIN || "hermes").trim();
const CODEX_BIN = (process.env.CODEX_BIN || "codex").trim();
/** How the brain is named in log lines the owner reads. */
const BRAIN_LABEL = IS_HERMES ? "Hermes" : IS_CODEX ? "Codex" : "Claude";
const THEPACK_TOOLS = [
    "mcp__thepack__whoami",
    "mcp__thepack__get_assigned_jobs",
    "mcp__thepack__get_input_file",
    "mcp__thepack__set_task_plan",
    "mcp__thepack__report_progress",
    "mcp__thepack__submit_result",
    "mcp__thepack__upload_file",
    "mcp__thepack__submit_image_result",
    "mcp__thepack__get_revision_feedback",
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
    "   b. If the job has currentRound > 1, this is a REVISION job. First call mcp__thepack__get_revision_feedback(executionId) to read the publisher's feedback. Then redo the work addressing the specific feedback. If there are feedbackFiles in the feedback, use mcp__thepack__get_input_file(fileId) to read them.",
    "   c. Call mcp__thepack__set_task_plan with an ordered checklist of 3-6 short step titles.",
    "   d. Do the work ONE STEP AT A TIME. The moment a step is finished, before starting the next one, call mcp__thepack__report_progress(executionId, stepId=<that step's number>, status=\"done\", message=<one line on what you produced>). This is not bookkeeping you can leave to the end: the publisher is watching the plan tick over while they wait, and a plan that never moves reads as a job that hung. Do not batch these calls. Every step must be marked done before you submit.",
    "   e. Deliver in the exact form the task asks for. READ the task's outputFormat and description and pick the matching method — the publisher's stated output format wins over the task type:",
    "      - TEXT / markdown / or a link is requested: call mcp__thepack__submit_result with the executionId and the complete result as markdown (put any URL, e.g. a Figma link, inside the markdown).",
    "      - AN IMAGE is requested (the brief/outputFormat says image, PNG, screenshot, 'as an image', a picture, a mockup rendered as an image, or the task type is IMAGE_GENERATION / IMAGE_EDITING): deliver an actual image file via mcp__thepack__upload_file then mcp__thepack__submit_image_result(executionId, fileIds=[the returned id], result note).",
    "         · If you produced the file LOCALLY (Pillow, ffmpeg, any script — the normal case): call mcp__thepack__upload_file(executionId, filename, contentType, filePath=<ABSOLUTE path of the file in your workspace>). The upload server reads it from disk — works for any size. NEVER paste large base64.",
    "         · If the image should be a Figma / FigJam design: FIRST create it with the Figma tools (mcp__claude_ai_Figma__generate_diagram for a flowchart/diagram, or use_figma for a design). THEN render it with mcp__claude_ai_Figma__get_screenshot, passing fileKey (extracted from the board/design URL) and nodeId \"0:1\" (the whole board). get_screenshot returns an image_url — DO NOT set enableBase64Response and DO NOT paste base64. Instead call mcp__thepack__upload_file(executionId, filename='design.png', contentType='image/png', sourceUrl=<the image_url from get_screenshot>) — the ThePack server downloads the PNG itself. Then submit_image_result. Include the Figma link in your submit note too.",
    "         · base64Content is a last resort for tiny files (<100 KB) only.",
    "      - A WEB PAGE / UI / interactive component / HTML is requested (a page, widget, mockup you can actually open, or the brief mentions HTML/CSS/JS/a component): write ONE self-contained file (all CSS and JS INLINE in a single .html — no external files, no build step) to your working directory. You MUST deliver it as an UPLOADED FILE so the publisher can open the live page: (1) mcp__thepack__upload_file(executionId, filename='index.html', contentType='text/html', filePath=<ABSOLUTE path>) → returns a file id; (2) mcp__thepack__submit_result(executionId, result=<short description of what you built>, fileIds=[that id]). Do NOT inline the HTML into `result` or `outputFiles`, and do NOT rename it to .txt — it has to be an uploaded .html file. Use any relevant installed skills for design/interaction quality.",
    "   f. LAST CHECK before any submit_* call: look at your plan. Any step still pending means you skipped its report_progress call — send the missing ones now, then submit.",
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
// Run a command to completion, returning its exit code. Used for the small
// setup/discovery commands (never for the agent run itself, which needs the
// watchdog and streaming in runAgent()).
/** Quote one argv entry for a Windows shell. Paths here contain spaces. */
function winQuote(a) {
    return /[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a;
}
function run(cmd, args, stdin = "", timeoutMs = 120_000) {
    return new Promise((resolve) => {
        // On Windows an npm-installed CLI is a .cmd shim, which spawn() cannot
        // resolve without a shell — it fails with ENOENT, which surfaced here as a
        // silent "could not register the MCP server". So go through a shell there
        // and do the quoting ourselves. Same reason the Claude branch of runAgent()
        // uses shell:true.
        const child = process.platform === "win32"
            ? spawn(`${cmd} ${args.map(winQuote).join(" ")}`, { shell: true })
            : spawn(cmd, args, { shell: false });
        const timer = setTimeout(() => {
            try {
                child.kill("SIGKILL");
            }
            catch { /* already gone */ }
            resolve(-1);
        }, timeoutMs);
        child.stdin.end(stdin);
        child.on("close", (code) => { clearTimeout(timer); resolve(code ?? -1); });
        child.on("error", () => { clearTimeout(timer); resolve(-1); });
    });
}
// Hermes keeps MCP servers in its own persistent config rather than taking a
// per-invocation config file like Claude's --mcp-config, so we (re)register the
// ThePack server once at startup. Remove-then-add keeps it idempotent and picks
// up a changed agent key or server URL. `--args` must come last.
async function ensureHermesMcp() {
    await run(HERMES_BIN, ["mcp", "remove", "thepack"]); // may not exist — ignore
    // `mcp add` connects, lists the discovered tools, then asks "Enable all N
    // tools?" on stdin. Answer it so registration completes unattended.
    const code = await run(HERMES_BIN, [
        "mcp", "add", "thepack",
        "--command", "node",
        "--args", mcpEntry, "-k", agentKey, "-s", serverUrl,
    ], "Y\n");
    log(code === 0
        ? "ThePack MCP server registered with Hermes."
        : `WARNING: could not register the ThePack MCP server with Hermes (exit ${code}). The agent will not be able to fetch or submit jobs.`);
}
// Codex also keeps MCP servers in a persistent config (~/.codex/config.toml)
// rather than accepting a per-invocation file, so the same remove-then-add
// dance applies. Unlike Hermes it is fully non-interactive — no tool-enable
// prompt to answer — and the launch command goes after a literal `--`.
async function ensureCodexMcp() {
    await run(CODEX_BIN, ["mcp", "remove", "thepack"]); // may not exist — ignore
    const code = await run(CODEX_BIN, [
        "mcp", "add", "thepack",
        "--", "node", mcpEntry, "-k", agentKey, "-s", serverUrl,
    ]);
    log(code === 0
        ? "ThePack MCP server registered with Codex."
        : `WARNING: could not register the ThePack MCP server with Codex (exit ${code}). The agent will not be able to fetch or submit jobs.`);
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
// How to launch the Nous Hermes Agent for one job. Hermes' one-shot flag takes
// the prompt as an ARGUMENT (it cannot be read from stdin), so we spawn without
// a shell and hand argv across directly — that sidesteps quoting entirely and
// the OS argument limit is far above our multi-KB prompt. Approvals are already
// auto-bypassed in one-shot mode, so there is no separate permission flag.
function hermesCommand(workDir) {
    const args = ["-z", WORK_PROMPT];
    // Model / provider / reasoning overrides, same idea as CLAUDE_MODEL.
    const model = (process.env.HERMES_MODEL || "").trim();
    if (model)
        args.push("-m", model);
    const provider = (process.env.HERMES_PROVIDER || "").trim();
    if (provider)
        args.push("--provider", provider);
    const reasoning = (process.env.HERMES_REASONING || "").trim();
    if (reasoning)
        args.push("--reasoning", reasoning);
    // Optional tool allowlist. Hermes names built-in toolsets plainly ("web") and
    // MCP tools as server:tool ("thepack:submit_result"). Left unset the agent
    // keeps its full toolset, which is what the sealed container assumes.
    const toolsets = (process.env.HERMES_TOOLSETS || "").trim();
    if (toolsets)
        args.push("-t", toolsets);
    // Per-run cost/token report. Written even when the run fails, so the platform
    // side can account for what a job actually cost to produce.
    args.push("--usage-file", path.join(workDir, "usage.json"));
    return { cmd: HERMES_BIN, args };
}
// How to launch the OpenAI Codex CLI for one job. Like Claude it reads the
// instruction from stdin, so nothing here has to carry the prompt.
function codexCommand(workDir) {
    const args = ["exec"];
    // Codex expects to be pointed at a repo and refuses to start outside one.
    // A job's scratch directory is a bare temp dir, so say so explicitly.
    args.push("--skip-git-repo-check");
    // Do not leave a session file in CODEX_HOME for every job. We never resume.
    args.push("--ephemeral");
    // Run with the job's scratch directory as the workspace root, matching the
    // `cwd` the other two CLIs get.
    args.push("-C", workDir);
    // Left unset on purpose by default. A Codex signed in with a ChatGPT
    // subscription refuses EVERY explicit model with "The '<name>' model is not
    // supported when using Codex with a ChatGPT account" — measured against
    // gpt-5.5, gpt-5, gpt-5.1, gpt-5.1-codex, gpt-5.1-codex-max, gpt-5.2-codex,
    // gpt-5-codex, o4-mini and codex-mini-latest, all rejected. Such an account
    // must run on whatever default the CLI picks. CODEX_MODEL is here for an
    // API-key account, which can choose.
    const model = (process.env.CODEX_MODEL || "").trim();
    if (model)
        args.push("-m", model);
    // Codex sandboxes the commands the model runs. Inside our container that is
    // a sandbox within a sandbox: the box already confines the whole process, and
    // Codex's own layer blocks the file and network access a real job needs. So
    // when the box has declared itself the boundary (RUNNER_BYPASS=1, set by
    // docker-compose) we hand Codex the flag that defers to it — which is exactly
    // the case its own help text describes as "intended solely for running in
    // environments that are externally sandboxed".
    //
    // On bare metal there is no such boundary, so Codex keeps its own:
    // --approve-for-me auto-reviews approval requests instead of waiting on a
    // human who is not there, and already implies the workspace-write sandbox —
    // passing -s alongside it is rejected as a conflicting argument.
    if (process.env.RUNNER_BYPASS === "1") {
        args.push("--dangerously-bypass-approvals-and-sandbox");
    }
    else {
        args.push("--approve-for-me");
    }
    return { cmd: CODEX_BIN, args };
}
function runAgent() {
    return new Promise((resolve) => {
        // Per-run scratch space, created first because the Hermes command line
        // embeds a path inside it (the usage report).
        const workDir = mkdtempSync(path.join(jobsRoot, "job-"));
        const isWin = process.platform === "win32";
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
        // detached on POSIX so the child is a process-group leader — lets the
        // watchdog kill the WHOLE tree (shell + agent + any grandchild) on timeout.
        let child;
        if (IS_HERMES) {
            // Hermes takes the prompt as an argument, so spawn without a shell and
            // pass argv straight through: no quoting rules to get wrong.
            const { cmd, args } = hermesCommand(workDir);
            child = spawn(cmd, args, { shell: false, cwd: workDir, detached: !isWin });
        }
        else if (IS_CODEX) {
            // Codex reads the prompt from stdin, so argv carries only flags and can
            // go across without a shell — same reasoning as Hermes.
            //
            // No tool allowlist is passed because Codex has no equivalent of Claude's
            // --allowedTools: its MCP servers are all-or-nothing from its own config.
            // The container is therefore the only isolation boundary under Codex; see
            // the banner at startup, which says so out loud.
            const { cmd, args } = codexCommand(workDir);
            // On Windows the CLI is a .cmd shim that only a shell can resolve. Safe
            // to route through one here because argv carries flags only — the
            // multi-KB prompt goes over stdin and never meets a quoting rule.
            child = isWin
                ? spawn(`${cmd} ${args.map(winQuote).join(" ")}`, {
                    shell: true,
                    cwd: workDir,
                })
                : spawn(cmd, args, { shell: false, cwd: workDir, detached: true });
        }
        else {
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
            // shell:true so Windows resolves the `claude` shim; prompt goes via stdin
            // to avoid any quoting issues with the long multi-line instruction.
            const quoted = args
                .map((a) => (a.includes(" ") || a.includes("\\") ? `"${a}"` : a))
                .join(" ");
            child = spawn(`claude ${quoted}`, { shell: true, cwd: workDir, detached: !isWin });
        }
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
        // Watchdog: an agent run can HANG indefinitely (e.g. a stalled API response
        // stream that never errors or closes). Without this the promise never
        // resolves, `busy` stays true forever, and the runner silently stops taking
        // work. Kill it after CLAUDE_TIMEOUT_MIN and let the loop retry the job.
        const timeoutMs = Math.max(1, parseInt(process.env.CLAUDE_TIMEOUT_MIN || "15", 10) || 15) * 60_000;
        const watchdog = setTimeout(() => {
            log(`${AGENT_CLI} exceeded ${Math.round(timeoutMs / 60000)} min with no exit — killing (likely a stalled network stream); the job will be retried`);
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
        // Claude and Codex read the instruction from stdin; Hermes already has it
        // in argv.
        if (!IS_HERMES)
            child.stdin.write(WORK_PROMPT);
        child.stdin.end();
        const binName = IS_HERMES ? HERMES_BIN : IS_CODEX ? CODEX_BIN : "claude";
        child.stdout.on("data", (d) => process.stdout.write(d));
        child.stderr.on("data", (d) => process.stderr.write(d));
        child.on("close", (code) => finish(`${AGENT_CLI} finished (exit ${code})`));
        child.on("error", (e) => finish(`failed to launch ${AGENT_CLI}: ${e.message}. Is the '${binName}' CLI on PATH?`));
    });
}
async function tick() {
    // Periodically (startup + every 5 min) re-discover the account's connectors
    // and piggyback them on the heartbeat so the website checklist stays fresh.
    // Connectors are a claude.ai account concept, so this only applies when Claude
    // is the brain; Hermes and Codex get their tools from their own MCP
    // registrations instead.
    let discovered;
    if (IS_CLAUDE && Date.now() - lastDiscoveryAt > DISCOVER_EVERY_MS) {
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
            log(`${count} job(s) dispatched — handing off to local ${BRAIN_LABEL}…`);
            busy = true;
            // Re-read the owner's approved connectors so a change on the website takes
            // effect on the next job without restarting the runner.
            if (IS_CLAUDE)
                await refreshApprovedConnectors();
            await runAgent();
            busy = false;
        }
    }
    catch (e) {
        busy = false;
        log(`poll failed: ${e.message}`);
    }
}
log(`ThePack runner started. server=${serverUrl} poll=${pollMs / 1000}s`);
if (IS_HERMES) {
    log(`Brain: local '${HERMES_BIN}' CLI (Nous Hermes Agent), model=${process.env.HERMES_MODEL?.trim() || "config default"}${process.env.HERMES_PROVIDER ? ` provider=${process.env.HERMES_PROVIDER.trim()}` : ""} (one-shot mode; approvals auto-bypassed).`);
}
else if (IS_CODEX) {
    const externallySandboxed = process.env.RUNNER_BYPASS === "1";
    log(`Brain: local '${CODEX_BIN}' CLI (OpenAI Codex), model=${process.env.CODEX_MODEL?.trim() || "account default"} (${externallySandboxed ? "deferring to the container for isolation" : "workspace-write sandbox, approvals auto-reviewed"}).`);
    // Say this plainly rather than leaving it to be discovered: under Claude the
    // --allowedTools list keeps un-approved account connectors uninvokable even
    // when they load. Codex has no per-tool allowlist, so whatever is registered
    // in its config is callable and the container is the only wall.
    log("Note: Codex has no per-tool allowlist, so connector approval is not enforced at the tool level — isolation comes from the sandbox container.");
}
else {
    log(`Brain: local 'claude' CLI, model=${process.env.CLAUDE_MODEL?.trim() || "account default"} (${process.env.RUNNER_BYPASS === "1" ? "bypass perms" : "local tools + ThePack tools"}; connectors gated by owner approval).`);
}
log("Leave this running. Assign tasks to this agent on the website — they'll be handled automatically.");
// Hermes and Codex both need the ThePack MCP server written into their own
// persistent config before the first job; Claude gets the same wiring per-run
// via --mcp-config.
async function start() {
    if (IS_HERMES)
        await ensureHermesMcp();
    else if (IS_CODEX)
        await ensureCodexMcp();
    else
        void refreshApprovedConnectors();
    void tick();
    setInterval(() => void tick(), pollMs);
}
void start();
