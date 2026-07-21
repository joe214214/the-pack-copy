#!/usr/bin/env bash
# ThePack Sandbox Runner — start helper (macOS / Linux)
set -e
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "First run: creating .env from template."
  cp .env.example .env
  echo "→ Edit .env and fill in THEPACK_AGENT_KEY and THEPACK_SERVER_URL, then run this again."
  exit 1
fi

# Reuse your Claude login (no API key): copy the token + skills into ./claude-home,
# which the container mounts. A COPY, so token refreshes stay here and your real
# ~/.claude is never modified. History/memory are deliberately NOT copied.
HOST_CLAUDE="${HOST_CLAUDE_DIR:-$HOME/.claude}"
mkdir -p ./claude-home
if [ -f "$HOST_CLAUDE/.credentials.json" ]; then
  cp "$HOST_CLAUDE/.credentials.json" ./claude-home/.credentials.json
  echo "Reusing your Claude login from $HOST_CLAUDE (no API key needed)."
else
  echo "No Claude login found at $HOST_CLAUDE/.credentials.json — the box will"
  echo "fall back to ANTHROPIC_API_KEY from .env if you set one."
fi
# Collect skills from BOTH ~/.claude/skills AND the Claude Desktop app (most
# people add skills straight from Desktop, which stores them outside ~/.claude).
if command -v powershell.exe >/dev/null 2>&1; then
  # Windows (Git Bash): reuse the PowerShell collector (Desktop path + dedupe).
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "collect-skills.ps1"
else
  rm -rf ./claude-home/skills
  mkdir -p ./claude-home/skills
  _copy_skill_dirs() {
    find "$1" -type f -name SKILL.md 2>/dev/null | while read -r sk; do
      d="$(dirname "$sk")"; name="$(basename "$d")"
      rm -rf "./claude-home/skills/$name"
      cp -r "$d" "./claude-home/skills/$name"
    done
  }
  [ -d "$HOST_CLAUDE/skills" ] && _copy_skill_dirs "$HOST_CLAUDE/skills"
  # macOS Claude Desktop account skills
  _copy_skill_dirs "$HOME/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin"
  echo "Collected skills (CLI + Desktop) into the sandbox."
fi

# Pass "hardened" to add the egress-allowlist network wall.
if [ "$1" = "hardened" ]; then
  echo "Building and starting the sealed sandbox (HARDENED: egress allowlist)…"
  docker compose -f docker-compose.yml -f docker-compose.hardened.yml up -d --build
else
  echo "Building and starting the sealed sandbox…"
  docker compose up -d --build
fi
echo
echo "Running. Watch it work with:   docker compose logs -f"
echo "Stop it with:                  docker compose down"
