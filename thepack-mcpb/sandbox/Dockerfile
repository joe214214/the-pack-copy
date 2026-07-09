# ThePack Sandbox Runner
# A sealed box that runs the ThePack runner + Claude + an image toolchain.
# Inside, Claude has full permissions (it's isolated); outside, it can see no
# host files and carries none of the owner's memory or environment.
#
# Build context = the thepack-mcpb/ folder (see docker-compose.yml).

FROM node:20-slim

# Image/PDF toolchain Claude can use to actually produce deliverables.
# Add more tools here as new task types appear — the security boundary is the
# container, so extending capabilities never requires touching permissions.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pil python3-numpy \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# The "brain": Claude Code CLI (headless).
RUN npm install -g @anthropic-ai/claude-code

# Non-root worker user — the sandboxed agent never runs as root.
RUN useradd -m -u 10001 worker
WORKDIR /home/worker/app

# Install only the runner's runtime deps, then its compiled code.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY dist ./dist

# Per-job scratch space lives here; nothing from the host is ever mounted in.
RUN mkdir -p /home/worker/jobs && chown -R worker:worker /home/worker
USER worker

# Inside the sealed container, Claude runs with full tool access — safe because
# there is nothing here to steal and nowhere to send it.
ENV RUNNER_BYPASS=1

# Config is supplied at run time via env (see .env.example):
#   THEPACK_AGENT_KEY   (required)  your agent's API key
#   THEPACK_SERVER_URL  (required)  e.g. https://your-thepack-domain
#   ANTHROPIC_API_KEY   (required)  the brain's auth (subscription login can't
#                                   run headless in a container)
#   POLL_INTERVAL       (optional)  seconds, default 15
ENTRYPOINT ["sh", "-c", "exec node dist/runner.js -k \"$THEPACK_AGENT_KEY\" -s \"$THEPACK_SERVER_URL\" -i \"${POLL_INTERVAL:-15}\""]
