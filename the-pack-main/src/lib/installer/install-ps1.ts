/**
 * Windows installer template — GENERATED, do not edit.
 *
 * Source: thepack-mcpb/release/install.ps1.tpl
 * Regenerate: node thepack-mcpb/release/build-templates.mjs
 *
 * Placeholders are filled in by src/lib/installer/render.ts.
 */

export const INSTALL_PS1_TEMPLATE = `# ThePack Agent — installer for Windows
#
# This file is generated per agent by the ThePack Worker Dashboard. The values
# below are already yours; there is nothing to edit.
#
# Right-click the file and choose "Run with PowerShell", or from a terminal:
#   powershell -ExecutionPolicy Bypass -File install-thepack-agent.ps1
#
# It pulls a prebuilt image (nothing is compiled here), copies the login for the
# brain you picked, and starts the worker in the background.

$ErrorActionPreference = 'Stop'

# ── Injected by the server ───────────────────────────────────────────────────
$AgentKey   = '{{AGENT_KEY}}'
$ServerUrl  = '{{SERVER_URL}}'
$AgentCli   = '{{AGENT_CLI}}'
$AgentName  = '{{AGENT_NAME}}'
$Image      = '{{IMAGE}}'
$Container  = 'thepack-agent'
# ─────────────────────────────────────────────────────────────────────────────

$Dir = Join-Path $HOME '.thepack-agent'

function Fail($msg) {
  Write-Host ''
  Write-Host "ERROR: $msg" -ForegroundColor Red
  Write-Host ''
  Read-Host 'Press Enter to close'
  exit 1
}

Write-Host ''
Write-Host "ThePack Agent - $AgentName"
Write-Host "Brain: $AgentCli"
Write-Host ''

# 1. Docker -------------------------------------------------------------------
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail 'Docker is not installed. Get Docker Desktop from https://docker.com/products/docker-desktop then run this installer again. On Windows, Docker Desktop will ask to enable WSL2 during setup - accept it.'
}

docker info 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Fail 'Docker is installed but not running. Start Docker Desktop, wait for it to say "Engine running", then run this installer again.'
}

Write-Host 'Docker is ready.'

# 2. Copy the login for the chosen brain --------------------------------------
# A COPY is taken, never a mount of the real directory: token refreshes and any
# writes stay under $Dir, so the agent cannot alter the login you use yourself.
New-Item -ItemType Directory -Force -Path $Dir | Out-Null

switch ($AgentCli) {
  'claude' {
    $src = if ($env:HOST_CLAUDE_DIR) { $env:HOST_CLAUDE_DIR } else { Join-Path $HOME '.claude' }
    if (-not (Test-Path (Join-Path $src '.credentials.json'))) {
      Fail "No Claude login found at $src. Run 'claude' once, sign in, then run this installer again."
    }
    $brainHome = Join-Path $Dir 'claude-home'
    New-Item -ItemType Directory -Force -Path $brainHome | Out-Null
    Copy-Item (Join-Path $src '.credentials.json') (Join-Path $brainHome '.credentials.json') -Force
    # Skills are what make the agent good at real work, so bring them along.
    $skills = Join-Path $brainHome 'skills'
    if (Test-Path $skills) { Remove-Item $skills -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $skills | Out-Null
    $srcSkills = Join-Path $src 'skills'
    if (Test-Path $srcSkills) {
      Get-ChildItem $srcSkills -Recurse -Filter 'SKILL.md' -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item $_.Directory.FullName (Join-Path $skills $_.Directory.Name) -Recurse -Force
      }
    }
    $mounts = @('-v', ($brainHome + ':/home/worker/.claude'))
  }
  'hermes' {
    $src = if ($env:HOST_HERMES_DIR) { $env:HOST_HERMES_DIR } else { Join-Path $env:LOCALAPPDATA 'hermes' }
    if (-not (Test-Path (Join-Path $src 'auth.json'))) {
      Fail "No Hermes login found at $src. Run 'hermes' once, sign in, then run this installer again."
    }
    $brainHome = Join-Path $Dir 'hermes-home'
    New-Item -ItemType Directory -Force -Path (Join-Path $brainHome 'shared') | Out-Null
    Copy-Item (Join-Path $src 'auth.json') (Join-Path $brainHome 'auth.json') -Force
    if (Test-Path (Join-Path $src 'config.yaml')) {
      Copy-Item (Join-Path $src 'config.yaml') (Join-Path $brainHome 'config.yaml') -Force
    }
    $nous = Join-Path $src 'shared'
    $nous = Join-Path $nous 'nous_auth.json'
    if (Test-Path $nous) {
      $dest = Join-Path $brainHome 'shared'
      Copy-Item $nous (Join-Path $dest 'nous_auth.json') -Force
    }
    # Read-only and mounted BESIDE ~/.hermes, not over it: that directory also
    # holds the installed agent. The container copies these into place.
    $mounts = @('-v', ($brainHome + ':/home/worker/hermes-home:ro'))
  }
  'codex' {
    $src = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
    if (-not (Test-Path (Join-Path $src 'auth.json'))) {
      Fail "No Codex login found at $src. Run 'codex' once, sign in, then run this installer again."
    }
    $brainHome = Join-Path $Dir 'codex-home'
    New-Item -ItemType Directory -Force -Path $brainHome | Out-Null
    # ONLY auth.json. Copying config.toml would bring over a model pin your
    # account may not have access to, plus MCP servers pointing at paths that do
    # not exist in the container.
    Copy-Item (Join-Path $src 'auth.json') (Join-Path $brainHome 'auth.json') -Force
    $mounts = @('-v', ($brainHome + ':/home/worker/.codex'))
  }
  default { Fail "Unknown brain '$AgentCli'." }
}

Write-Host "Copied your $AgentCli login into $Dir (a copy - your own login is untouched)."

# 3. Pull ---------------------------------------------------------------------
Write-Host 'Downloading the agent image (about 1.7 GB, once)...'
docker pull $Image | Out-Null
if ($LASTEXITCODE -ne 0) { Fail 'Could not download the image. Check your connection and try again.' }

# 4. Start --------------------------------------------------------------------
docker rm -f $Container 2>$null | Out-Null
$runArgs = @(
  'run', '-d',
  '--name', $Container,
  '--restart', 'unless-stopped',
  '--security-opt', 'no-new-privileges:true',
  '-e', ('THEPACK_AGENT_KEY=' + $AgentKey),
  '-e', ('THEPACK_SERVER_URL=' + $ServerUrl),
  '-e', ('AGENT_CLI=' + $AgentCli)
) + $mounts + @($Image)

docker @runArgs | Out-Null
if ($LASTEXITCODE -ne 0) { Fail 'Could not start the agent.' }

Start-Sleep -Seconds 3
# -q prints ids only, so this needs no --format string — which matters because
# a Go template like {{.Names}} collides with the {{PLACEHOLDER}} substitution
# the server does on this file.
$running = docker ps --filter ('name=' + $Container) --filter 'status=running' -q
if (-not $running) {
  Fail "The agent started but stopped again. See what happened with: docker logs $Container"
}

Write-Host ''
Write-Host "Done. $AgentName is online and waiting for work." -ForegroundColor Green
Write-Host ''
Write-Host "  Watch it work:  docker logs -f $Container"
Write-Host "  Stop it:        docker stop $Container"
Write-Host "  Start it again: docker start $Container"
Write-Host ''
Write-Host 'It restarts by itself when your computer reboots. Go dispatch a task to'
Write-Host "this agent on $ServerUrl and it will pick it up within seconds."
Write-Host ''
Read-Host 'Press Enter to close'
`;
