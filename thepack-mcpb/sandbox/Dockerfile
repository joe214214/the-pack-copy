# ThePack Sandbox Runner
# =====================================================================
# A sealed box that runs the ThePack runner + Claude + a tool toolchain.
# INSIDE the box Claude keeps full permissions and can use every skill/tool
# (that's the point — functionality is not restricted). OUTSIDE the box it
# sees no host files, inherits none of your shell's environment, and (in
# hardened mode) can only reach an allowlist of domains.
#
# Security model: don't limit the agent's hands — control the room it's in.
# Extending capabilities later = install more tools here; permissions never
# need touching.
#
# Build context = the thepack-mcpb/ folder (see docker-compose.yml).

# Node 24: the Hermes installer rejects Node 20 (it wants 22.22+/24.11+/26+) and
# would otherwise download a second Node runtime into the image.
FROM node:24-slim

# Toolchain the agent can use to actually produce deliverables. Add more here as
# new task types appear (ffmpeg for video, pandoc for docs, etc.) — the
# security boundary is the container, so new tools never weaken isolation.
# curl/ripgrep/xz-utils/build-essential are what the Hermes installer needs:
# without a C++ compiler it cannot build its native modules (node-pty).
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pil python3-numpy python3-pip python3-venv \
      fonts-dejavu-core \
      ca-certificates git curl ripgrep xz-utils build-essential \
    && rm -rf /var/lib/apt/lists/*

# Brain #1: Claude Code CLI (headless). Selected with AGENT_CLI=claude.
RUN npm install -g @anthropic-ai/claude-code

# Non-root worker — the sandboxed agent never runs as root.
RUN useradd -m -u 10001 worker
WORKDIR /home/worker/app

# Runner runtime deps, then its compiled code.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY dist ./dist

# Per-job scratch space (mounted as tmpfs at run time). The only host mount is
# ./claude-home -> /home/worker/.claude (a COPY of your Claude login + skills),
# so the boxed Claude runs on your subscription — no API key required.
RUN mkdir -p /home/worker/jobs /home/worker/.claude && chown -R worker:worker /home/worker
USER worker
ENV HOME=/home/worker
ENV JOBS_DIR=/home/worker/jobs

# Brain #2: Nous Hermes Agent (AGENT_CLI=hermes). Installed as the worker user
# because it lives in that user's home: code in ~/.hermes/hermes-agent, launcher
# in ~/.local/bin. --skip-setup keeps the installer non-interactive; the account
# credentials come from the owner's machine at run time (see the entrypoint).
# Build with --build-arg INSTALL_HERMES=0 for a leaner Claude-only image.
ARG INSTALL_HERMES=1
RUN if [ "$INSTALL_HERMES" = "1" ]; then \
      curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --skip-setup; \
    fi
ENV PATH=/home/worker/.local/bin:/home/worker/.hermes/bin:$PATH

# Inside the sealed container Claude runs with full tool access (RUNNER_BYPASS)
# — safe because there is nothing here to steal and (hardened mode) nowhere to
# send it.
ENV RUNNER_BYPASS=1

# Config is supplied at run time via env (see .env.example):
#   THEPACK_AGENT_KEY   (required)  your agent's API key (tpk_...)
#   THEPACK_SERVER_URL  (required)  e.g. https://your-thepack-domain
#   ANTHROPIC_API_KEY   (optional)  FALLBACK only. By default Claude reuses your
#                                   login via the mounted ./claude-home; set this
#                                   only if there is no Claude login to reuse.
#   POLL_INTERVAL       (optional)  seconds, default 15
#   AGENT_CLI           (optional)  "claude" (default) or "hermes"
#   HERMES_MODEL        (optional)  model override when AGENT_CLI=hermes
#
# Hermes keeps its credentials and config inside ~/.hermes, which also holds the
# installed agent itself — so that directory cannot simply be mounted over the
# way ./claude-home is. Instead the host copy is mounted read-only alongside it
# and the few credential files are copied into place here, before the runner
# starts.
ENTRYPOINT ["sh", "-c", "if [ -d /home/worker/hermes-home ]; then mkdir -p /home/worker/.hermes/shared; cp -f /home/worker/hermes-home/auth.json /home/worker/hermes-home/config.yaml /home/worker/.hermes/ 2>/dev/null || true; cp -f /home/worker/hermes-home/shared/nous_auth.json /home/worker/.hermes/shared/ 2>/dev/null || true; fi; exec node dist/runner.js -k \"$THEPACK_AGENT_KEY\" -s \"$THEPACK_SERVER_URL\" -i \"${POLL_INTERVAL:-15}\""]
