@echo off
REM ThePack Sandbox Runner - start helper (Windows)
cd /d "%~dp0"

if not exist .env (
  echo First run: creating .env from template.
  copy .env.example .env >nul
  echo.
  echo -^> Edit .env and fill in THEPACK_AGENT_KEY and THEPACK_SERVER_URL, then run this again.
  pause
  exit /b 1
)

REM Reuse your Claude login (no API key): copy token + skills into claude-home,
REM which the container mounts. A COPY — your real .claude is never modified.
set "HOST_CLAUDE=%HOST_CLAUDE_DIR%"
if "%HOST_CLAUDE%"=="" set "HOST_CLAUDE=%USERPROFILE%\.claude"
if not exist claude-home mkdir claude-home
if exist "%HOST_CLAUDE%\.credentials.json" (
  copy /Y "%HOST_CLAUDE%\.credentials.json" claude-home\.credentials.json >nul
  echo Reusing your Claude login from %HOST_CLAUDE% ^(no API key needed^).
) else (
  echo No Claude login found at %HOST_CLAUDE%\.credentials.json - the box will
  echo fall back to ANTHROPIC_API_KEY from .env if you set one.
)
REM Collect skills from BOTH ~/.claude/skills AND the Claude Desktop app (most
REM people add skills straight from Desktop, which stores them outside ~/.claude).
echo Collecting your skills ^(CLI + Desktop^) into the sandbox...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0collect-skills.ps1"

REM Same idea for the other brain: copy the Hermes login so AGENT_CLI=hermes can
REM run on your Nous account. Only the credential files are copied (the agent
REM itself is installed in the image), and hermes-home is gitignored.
set "HOST_HERMES=%HOST_HERMES_DIR%"
if "%HOST_HERMES%"=="" set "HOST_HERMES=%LOCALAPPDATA%\hermes"
if not exist hermes-home\shared mkdir hermes-home\shared
if exist "%HOST_HERMES%\auth.json" (
  copy /Y "%HOST_HERMES%\auth.json" hermes-home\auth.json >nul
  if exist "%HOST_HERMES%\config.yaml" copy /Y "%HOST_HERMES%\config.yaml" hermes-home\config.yaml >nul
  if exist "%HOST_HERMES%\shared\nous_auth.json" copy /Y "%HOST_HERMES%\shared\nous_auth.json" hermes-home\shared\nous_auth.json >nul
  echo Reusing your Hermes login from %HOST_HERMES%.
) else (
  echo No Hermes login found at %HOST_HERMES% - that is only needed if you set AGENT_CLI=hermes.
)

REM Same idea for the third brain: copy the Codex login so AGENT_CLI=codex can
REM run on your Codex subscription. Only auth.json is copied - NOT the host
REM config.toml, whose MCP servers point at Windows paths that do not exist in
REM the box. Codex writes its own config.toml (including the ThePack MCP
REM registration the runner makes at startup) into this copy, so the mount is
REM read-write and your real .codex is never touched. codex-home is gitignored.
set "HOST_CODEX=%CODEX_HOME%"
if "%HOST_CODEX%"=="" set "HOST_CODEX=%USERPROFILE%\.codex"
if not exist codex-home mkdir codex-home
if exist "%HOST_CODEX%\auth.json" (
  copy /Y "%HOST_CODEX%\auth.json" codex-home\auth.json >nul
  echo Reusing your Codex login from %HOST_CODEX%.
) else (
  echo No Codex login found at %HOST_CODEX% - that is only needed if you set AGENT_CLI=codex.
)

REM Pass "hardened" to add the egress-allowlist network wall.
if "%1"=="hardened" (
  echo Building and starting the sealed sandbox ^(HARDENED: egress allowlist^)...
  docker compose -f docker-compose.yml -f docker-compose.hardened.yml up -d --build
) else (
  echo Building and starting the sealed sandbox...
  docker compose up -d --build
)
echo.
echo Running. Watch it work with:   docker compose logs -f
echo Stop it with:                  docker compose down
pause
