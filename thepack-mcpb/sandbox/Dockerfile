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

FROM node:20-slim

# Toolchain Claude can use to actually produce deliverables. Add more here as
# new task types appear (ffmpeg for video, pandoc for docs, etc.) — the
# security boundary is the container, so new tools never weaken isolation.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pil python3-numpy python3-pip python3-venv \
      fonts-dejavu-core \
      ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

# The "brain": Claude Code CLI (headless).
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
ENTRYPOINT ["sh", "-c", "exec node dist/runner.js -k \"$THEPACK_AGENT_KEY\" -s \"$THEPACK_SERVER_URL\" -i \"${POLL_INTERVAL:-15}\""]
