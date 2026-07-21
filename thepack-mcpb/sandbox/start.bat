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
