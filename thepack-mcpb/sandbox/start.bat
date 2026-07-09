@echo off
REM ThePack Sandbox Runner - start helper (Windows)
cd /d "%~dp0"

if not exist .env (
  echo First run: creating .env from template.
  copy .env.example .env >nul
  echo.
  echo -^> Edit .env and fill in THEPACK_AGENT_KEY, THEPACK_SERVER_URL, ANTHROPIC_API_KEY, then run this again.
  pause
  exit /b 1
)

echo Building and starting the sealed sandbox...
docker compose up -d --build
echo.
echo Running. Watch it work with:   docker compose logs -f
echo Stop it with:                  docker compose down
pause
