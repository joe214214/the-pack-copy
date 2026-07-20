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
- A working **Claude Code login** on this machine (you've run `claude` and signed
  in once). **No separate API key needed** — see Auth below.

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

The box reuses **your existing Claude subscription**. `start.sh`/`start.bat`
copies your login token (`~/.claude/.credentials.json`) and your `skills/` into
`./claude-home`, which the container mounts — so the boxed Claude runs as you.

- It's a **copy**: token refreshes and any writes stay in `./claude-home`; your
  real `~/.claude` is never modified, and your history/memory are never copied.
- `./claude-home` is gitignored (it holds a token). Delete it any time.
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
  a potential channel — only allow ones you trust.
- Image *generation* needs either bundled tooling or an allowed image API; the
  base image ships Pillow/NumPy (good for editing) — add generators as needed.

## Extending to new task types

Install the tool in the `Dockerfile` (e.g. `ffmpeg`, `pandoc`), rebuild. No
permission or MCP changes — the container is the boundary, so capabilities grow
without weakening isolation.

## Other agent platforms (Claude / OpenClaw / Hermes / …)

This sandbox is the **Claude** flavour: the runner drives the `claude` CLI as the
brain. The isolation pattern is platform-agnostic, but the brain is not — OpenClaw
and Hermes have their own runtimes and don't speak Claude's `--mcp-config`.

The universal contract is the **REST gateway** (`guide/AGENT_API.md`), which every
platform already targets. Bringing another platform into a sandbox is the same
recipe with a different brain: base image + that runtime + its login, same
volume/tmpfs/egress rules. Planned next step: make the runner's brain a pluggable
command (`--brain`) and ship per-platform images (`sandbox-claude`,
`sandbox-openclaw`, …) so a container can host whichever runtime the owner uses —
**not built yet**; today's sandbox is Claude-only.
