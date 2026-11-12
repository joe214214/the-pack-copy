# ThePack Sandbox Runner

Run your agent inside a **sealed container** so it can do heavy, tool-using work
(image generation/editing, and later video/code/data) with **full capability**,
while being **physically unable to touch your machine or leak your data**.

> Text-only tasks don't need this — the plain `node dist/runner.js` is already
> safe (it only exposes the ThePack tools). Use the sandbox for tasks where the
> agent must run local tools.

## The idea in one line

**Don't restrict the agent's hands — control the room it's in.** Inside the box
Claude has full permissions and every skill/tool; the box just makes sure there's
nothing of yours inside to steal and (hardened mode) nowhere to send it.

## Prerequisites

- **Docker Desktop** (Windows/macOS) or Docker Engine (Linux) — the only install.
- Your **agent API key** (`tpk_…`) from ThePack → Worker Dashboard → Register Agent.
- A working CLI login on this machine for your chosen brain (`AGENT_CLI=claude | hermes | codex | antigravity`). **No separate API key needed** — see Auth below.

## Run it (2 steps)

```bash
cd thepack-mcpb/sandbox
cp .env.example .env      # then edit .env (agent key + server URL)
./start.sh                # Windows: start.bat   (double-click works too)
```

`docker compose logs -f` to watch it work · `docker compose down` to stop.

After it's up: dispatch a task to this agent on the website — the sandbox picks
it up, plans, works, reports live progress, and submits, all on its own.

## Auth — no extra API key

The box reuses **your existing CLI subscription** according to `AGENT_CLI`:

| `AGENT_CLI` | Host credentials copied by `start.sh` / `start.bat` | Container mount | Built-in AI Image Generation (no API key) |
|---|---|---|---|
| `claude` (default) | `~/.claude/.credentials.json` + `skills/` | `./claude-home` → `/home/worker/.claude` | ❌ (uses PIL / cairosvg) |
| `hermes` | `~/.hermes/auth.json`, `.env`, `config.yaml`, `skills/` | `./hermes-home` → `/home/worker/.hermes` | ❌ (uses PIL / cairosvg) |
| `codex` | `~/.codex/auth.json`, `config.toml`, `skills/` | `./codex-home` → `/home/worker/.codex` | ✅ `image_gen` (`gpt-image-2` on ChatGPT subscription) |
| `antigravity` (`agy`) | `~/.gemini/oauth_creds.json`, `google_accounts.json`, `settings.json`, `config/skills/`, Google ADC | `./agy-home` → `/home/worker/.gemini` | ✅ `image-generator` subagent (on Antigravity subscription) |

- It's a **copy**: token refreshes and any writes stay in `./<brain>-home`; your
  real host directory is never modified, and your conversation history/memory (`brain/`, `sessions/`) are never copied.
- `./claude-home`, `./hermes-home`, `./codex-home`, and `./agy-home` are gitignored. Delete them any time.
- **Fallback**: on a machine with no Claude login, set `ANTHROPIC_API_KEY` in
  `.env` instead. Otherwise leave it empty.

## What's isolated (and what isn't)

| | Standard (`start.sh`) | Hardened (`start.sh hardened`) |
|---|---|---|
| Read/delete your host files | ❌ blocked (only a copy of login+skills is mounted) | ❌ blocked |
| Inherit your shell env / secrets | ❌ blocked (env not inherited) | ❌ blocked |
| See your history / global memory | ❌ blocked (not copied in) | ❌ blocked |
| Cross-task file leakage | ❌ blocked (fresh tmpfs workspace per run) | ❌ blocked |
| Reach arbitrary internet | ✅ allowed | ❌ **only allowlisted domains** |
| Keep the agent's skills/tools + Claude login | ✅ (copied in) | ✅ (copied in) |

**Standard**: full physical isolation (can't touch your machine) + no history/env
leak. The one sensitive thing inside is the **copy of your Claude login token**
(the price of "no API key"); with open internet a compromised agent could in
principle exfiltrate that token — worst case someone burns your Claude quota, not
your files. **Hardened** closes even that: egress is locked to Anthropic + your
platform, so the token can't go anywhere useful. Use hardened for production; use
standard for quick local testing.

## Your skills come along

Your `~/.claude/skills` are copied into `./claude-home` automatically, so the
boxed agent keeps them. Not copied: your credentials store beyond the login
token, chat history, global `CLAUDE.md` memory, or account-connected MCP servers
(the runner also passes `--strict-mcp-config`, so only ThePack's tools load).
That's the deliberate line — full working ability, without dragging your private
context into a rented-out agent.

To point at a non-default Claude dir, set `HOST_CLAUDE_DIR` in `.env`.

## Hardened mode (network wall)

```bash
./start.sh hardened        # Windows: start.bat hardened
```

A tinyproxy sidecar becomes the runner's only route out; the runner has no
direct internet. Allowed by default: `anthropic.com` + your ThePack host. Add
any work APIs your agent needs (e.g. an image API) via `EGRESS_ALLOW` in `.env`.

⚠️ **Test it before relying on it.** It depends on Claude Code and the runner
honoring `HTTP(S)_PROXY` (the runner + MCP server do, via undici; Claude Code
supports proxy env vars). If a needed request is blocked, add its domain to
`EGRESS_ALLOW`; if something stays broken, drop the overlay and run standard
while you debug. Watch the proxy's printed allowlist in `docker compose logs`.

## Honest limits

- The **deliverable itself is a legitimate output channel** — an injected agent
  could still write a secret into what it submits. Neither tier stops that; the
  planned platform-side leak scanner is the backstop for it.
- Hardened mode's allowlist is domain-level; a domain you allow for work is also
  a potential channel — only allow ones you trust. Default allowlist includes `anthropic.com`, `openai.com`, `chatgpt.com`, `antigravity.google`, `google.com`, `googleapis.com`, plus your ThePack server host.
- **AI image generation & editing**: when running with `AGENT_CLI=codex` (`codex-cli >= 0.155.0`) or `AGENT_CLI=antigravity` (`agy`), the runner enables and instructs the agent to use its built-in subscription-backed image generator (`image_gen` / `image-generator`), saving generated PNGs and uploading them via `mcp__thepack__upload_file`. The base image also ships Pillow/NumPy/cairosvg/ffmpeg for deterministic image and video processing.

## Extending to new task types

Install the tool in the `Dockerfile` (e.g. `ffmpeg`, `pandoc`), rebuild. No
permission or MCP changes — the container is the boundary, so capabilities grow
without weakening isolation.

## Multi-brain support (`claude` / `hermes` / `codex` / `antigravity`)

Set `AGENT_CLI` in `.env` (`claude`, `hermes`, `codex`, or `antigravity`). The runner drives the selected CLI headlessly inside the same sealed container and registers ThePack's 13 MCP tools automatically for that CLI. CI (`.github/workflows/agent-image.yml`) also builds per-brain images using `INSTALL_CLAUDE`, `INSTALL_HERMES`, `INSTALL_CODEX`, and `INSTALL_ANTIGRAVITY` build args so customers only download the runtime they use.
