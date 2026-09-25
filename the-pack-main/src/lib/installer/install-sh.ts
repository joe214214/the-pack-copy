/**
 * macOS / Linux installer template — GENERATED, do not edit.
 *
 * Source: thepack-mcpb/release/install.sh.tpl
 * Regenerate: node thepack-mcpb/release/build-templates.mjs
 *
 * Placeholders are filled in by src/lib/installer/render.ts.
 */

export const INSTALL_SH_TEMPLATE = `#!/usr/bin/env sh
# ThePack Agent — installer for macOS and Linux
#
# This file is generated per agent by the ThePack Worker Dashboard. The values
# below are already yours; there is nothing to edit.
#
#   sh install-thepack-agent.sh
#
# It pulls a prebuilt image (nothing is compiled here), copies the login for the
# brain you picked, and starts the worker in the background.
set -e

# ── Injected by the server ───────────────────────────────────────────────────
AGENT_KEY="{{AGENT_KEY}}"
SERVER_URL="{{SERVER_URL}}"
AGENT_CLI="{{AGENT_CLI}}"
AGENT_NAME="{{AGENT_NAME}}"
IMAGE="{{IMAGE}}"
CONTAINER="thepack-agent"
# ─────────────────────────────────────────────────────────────────────────────

DIR="$HOME/.thepack-agent"

say() { printf '%s\\n' "$1"; }
fail() { printf 'ERROR: %s\\n' "$1" >&2; exit 1; }

say ""
say "ThePack Agent — $AGENT_NAME"
say "Brain: $AGENT_CLI"
say ""

# 1. Docker -------------------------------------------------------------------
command -v docker >/dev/null 2>&1 || fail \\
"Docker is not installed. Get Docker Desktop from https://docker.com/products/docker-desktop
then run this installer again."

docker info >/dev/null 2>&1 || fail \\
"Docker is installed but not running. Start Docker Desktop, wait for it to say
'Engine running', then run this installer again."

say "Docker is ready."

# 2. Copy the login for the chosen brain --------------------------------------
# A COPY is taken, never a mount of the real directory: token refreshes and any
# writes stay under $DIR, so the agent cannot alter the login you use yourself.
mkdir -p "$DIR"

case "$AGENT_CLI" in
  claude)
    SRC="\${HOST_CLAUDE_DIR:-$HOME/.claude}"
    [ -f "$SRC/.credentials.json" ] || fail \\
"No Claude login found at $SRC.
Run 'claude' once, sign in, then run this installer again."
    mkdir -p "$DIR/claude-home"
    cp "$SRC/.credentials.json" "$DIR/claude-home/.credentials.json"
    # Skills are what make the agent good at real work, so bring them along.
    rm -rf "$DIR/claude-home/skills"; mkdir -p "$DIR/claude-home/skills"
    if [ -d "$SRC/skills" ]; then
      find "$SRC/skills" -type f -name SKILL.md 2>/dev/null | while read -r sk; do
        d=$(dirname "$sk"); cp -r "$d" "$DIR/claude-home/skills/$(basename "$d")"
      done
    fi
    MOUNTS="-v $DIR/claude-home:/home/worker/.claude"
    ;;
  hermes)
    SRC="\${HOST_HERMES_DIR:-$HOME/.hermes}"
    [ -f "$SRC/auth.json" ] || fail \\
"No Hermes login found at $SRC.
Run 'hermes' once, sign in, then run this installer again."
    mkdir -p "$DIR/hermes-home/shared"
    cp "$SRC/auth.json" "$DIR/hermes-home/auth.json"
    [ -f "$SRC/config.yaml" ] && cp "$SRC/config.yaml" "$DIR/hermes-home/config.yaml"
    [ -f "$SRC/shared/nous_auth.json" ] && cp "$SRC/shared/nous_auth.json" "$DIR/hermes-home/shared/nous_auth.json"
    # Read-only and mounted BESIDE ~/.hermes, not over it: that directory also
    # holds the installed agent. The container copies these into place.
    MOUNTS="-v $DIR/hermes-home:/home/worker/hermes-home:ro"
    ;;
  codex)
    SRC="\${CODEX_HOME:-$HOME/.codex}"
    [ -f "$SRC/auth.json" ] || fail \\
"No Codex login found at $SRC.
Run 'codex' once, sign in, then run this installer again."
    mkdir -p "$DIR/codex-home"
    # ONLY auth.json. Copying config.toml would bring over a model pin your
    # account may not have access to, plus MCP servers pointing at paths that do
    # not exist in the container.
    cp "$SRC/auth.json" "$DIR/codex-home/auth.json"
    MOUNTS="-v $DIR/codex-home:/home/worker/.codex"
    ;;
  *)
    fail "Unknown brain '$AGENT_CLI'."
    ;;
esac

say "Copied your $AGENT_CLI login into $DIR (a copy — your own login is untouched)."

# 3. Pull ---------------------------------------------------------------------
say "Downloading the agent image (about 1.7 GB, once)..."
docker pull "$IMAGE" >/dev/null || fail "Could not download the image. Check your connection and try again."

# 4. Start --------------------------------------------------------------------
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
# shellcheck disable=SC2086
docker run -d \\
  --name "$CONTAINER" \\
  --restart unless-stopped \\
  --security-opt no-new-privileges:true \\
  -e THEPACK_AGENT_KEY="$AGENT_KEY" \\
  -e THEPACK_SERVER_URL="$SERVER_URL" \\
  -e AGENT_CLI="$AGENT_CLI" \\
  $MOUNTS \\
  "$IMAGE" >/dev/null

sleep 3
# -q prints ids only, so this needs no --format string — which matters because
# a Go template like {{.Names}} collides with the {{PLACEHOLDER}} substitution
# the server does on this file.
docker ps --filter "name=$CONTAINER" --filter "status=running" -q | grep -q . || fail \\
"The agent started but stopped again. See what happened with:
  docker logs $CONTAINER"

say ""
say "Done. $AGENT_NAME is online and waiting for work."
say ""
say "  Watch it work:  docker logs -f $CONTAINER"
say "  Stop it:        docker stop $CONTAINER"
say "  Start it again: docker start $CONTAINER"
say ""
say "It restarts by itself when your computer reboots. Go dispatch a task to"
say "this agent on $SERVER_URL and it will pick it up within seconds."
say ""
`;
