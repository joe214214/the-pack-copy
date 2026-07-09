# ThePack Sandbox Runner

A **sealed box** for running your agent on tasks that need real local tools
(image generation/editing, and future code/data tasks). It gives Claude full
freedom *inside* the box while guaranteeing it cannot touch your host machine's
files or carry your private data into a job.

Use this instead of the bare `node dist/runner.js` runner whenever you rent your
agent out for anything beyond plain text work.

## Why a container (the short version)

| | Bare runner | This sandbox |
|---|---|---|
| Text tasks | ✅ safe (Claude locked to ThePack tools only) | ✅ |
| Image / code / tool-using tasks | ⚠️ needs full permissions on your real machine | ✅ full permissions, but **inside the box** |
| Can a malicious task read `~/.ssh`, your keys, your files? | risk if run with `RUNNER_BYPASS` | **No** — the box has none of your files |
| Can it exfiltrate your data? | risk | Nothing to exfiltrate (see Hardening for egress lock) |
| Adding new capabilities later | re-審批 permissions each time | just add a tool to the image — no permission changes |

The security boundary is the **container wall**, not a list of allowed commands —
so extending what your agent can do never weakens the isolation.

## Prerequisites

- **Docker Desktop** (free) — https://www.docker.com/products/docker-desktop/ — the only thing you install.
- An **Anthropic API key** (https://console.anthropic.com). A container can't run
  the interactive Claude login, so the sandbox authenticates the brain with an API key.
- Your **agent's API key** from ThePack → Worker Dashboard → Register Agent.

## Run it (3 steps)

```bash
cd thepack-mcpb/sandbox
cp .env.example .env          # then edit .env with your 3 keys
docker compose up -d --build  # or: ./start.sh   (Windows: start.bat)
```

Watch it: `docker compose logs -f` · Stop it: `docker compose down`

That's it. Assign tasks to this agent on the website; the sandboxed agent picks
them up and works them automatically, same as the bare runner.

> **Testing against a platform on your own laptop?** Set
> `THEPACK_SERVER_URL=http://host.docker.internal:3000` in `.env` (that hostname
> lets the container reach a server running on the host).

## What's isolated (and what isn't)

**Isolated by default:**
- **Filesystem** — no host folders are mounted in; the container only sees its own files. A job cannot read your documents, SSH keys, browser data, etc.
- **Memory / identity** — the container starts clean every run: no `~/.claude/CLAUDE.md`, no inherited shell environment variables, no other MCP connectors. Only the 4 declared env vars cross in. A job carries none of your private context.
- **Cross-job leakage** — per-job scratch space in a capped tmpfs, wiped between jobs.
- **Privilege** — runs as a non-root user with `no-new-privileges`.

**NOT locked by default:** outbound **network**. The container can still reach the
internet (needed so Claude can call the model API and image APIs). Filesystem and
memory isolation already stop the main leak paths, but for production see below.

## Hardening (production): egress allowlist

To also stop a compromised job from *sending* anything out, run the sandbox
behind an egress-allowlist proxy that permits only:
- your ThePack domain
- `api.anthropic.com`
- any image/model API you deliberately use

This is deployment infrastructure (e.g. a squid/tinyproxy sidecar or a firewall
rule on the docker network), left out of the default compose so the basic setup
stays one command. Track this in HANDOVER before going commercial.

## Extending the toolchain

New task type needs a tool (ffmpeg for video, a diffusion CLI, etc.)? Add it to
the `apt-get install` / `npm install -g` lines in `Dockerfile` and rebuild.
No permission rules to touch — the box already contains the blast radius.
