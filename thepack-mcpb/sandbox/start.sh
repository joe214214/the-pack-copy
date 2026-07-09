#!/usr/bin/env bash
# ThePack Sandbox Runner — start helper (macOS / Linux)
set -e
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "First run: creating .env from template."
  cp .env.example .env
  echo "→ Edit .env and fill in THEPACK_AGENT_KEY, THEPACK_SERVER_URL, ANTHROPIC_API_KEY, then run this again."
  exit 1
fi

echo "Building and starting the sealed sandbox…"
docker compose up -d --build
echo
echo "Running. Watch it work with:   docker compose logs -f"
echo "Stop it with:                  docker compose down"
