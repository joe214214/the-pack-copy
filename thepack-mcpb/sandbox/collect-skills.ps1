# Gather skills into ./claude-home/skills for the sandbox container.
#
# Most people add skills straight from the Claude Desktop app, which stores them
# in the app's package data — NOT in ~/.claude/skills. The container only sees
# ./claude-home/skills, so this script MERGES both sources into it (a COPY;
# originals are never touched). On a name collision the most recently modified
# copy wins.
#
#   1. ~/.claude/skills                         (Claude Code CLI / filesystem skills)
#   2. Claude Desktop account skills            (added via the Desktop "Skills" panel)
#        %LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\
#            local-agent-mode-sessions\skills-plugin\<uuid>\<uuid>\skills\<name>\SKILL.md
#
# Connectors are handled separately (the runner discovers them via `claude mcp
# list` and reports them on the heartbeat) — this script is skills only.

$ErrorActionPreference = 'SilentlyContinue'

$dest = Join-Path $PSScriptRoot 'claude-home\skills'
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dest | Out-Null

# Each candidate is a directory that directly contains a SKILL.md.
$candidates = New-Object System.Collections.Generic.List[object]

# 1) CLI / filesystem skills (~/.claude/skills, or HOST_CLAUDE_DIR override).
$cliRoot = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.claude\skills'
if ($env:HOST_CLAUDE_DIR) { $cliRoot = Join-Path $env:HOST_CLAUDE_DIR 'skills' }
if (Test-Path $cliRoot) {
  Get-ChildItem $cliRoot -Recurse -Filter SKILL.md -ErrorAction SilentlyContinue |
    ForEach-Object { $candidates.Add($_.Directory) }
}

# 2) Desktop account skills. The <uuid> session dirs change, so glob broadly and
#    recurse for SKILL.md.
$deskGlob = Join-Path $env:LOCALAPPDATA 'Packages\Claude_*\LocalCache\Roaming\Claude\local-agent-mode-sessions\skills-plugin'
Get-ChildItem $deskGlob -Directory -ErrorAction SilentlyContinue | ForEach-Object {
  Get-ChildItem $_.FullName -Recurse -Filter SKILL.md -ErrorAction SilentlyContinue |
    ForEach-Object { $candidates.Add($_.Directory) }
}

if ($candidates.Count -eq 0) {
  Write-Host '  (no skills found — nothing to copy)'
  return
}

# Dedupe by skill folder name, newest wins.
$candidates | Group-Object Name | ForEach-Object {
  $latest = $_.Group | Sort-Object LastWriteTime | Select-Object -Last 1
  Copy-Item $latest.FullName -Destination (Join-Path $dest $_.Name) -Recurse -Force
  Write-Host "  + skill: $($_.Name)"
}

$n = (Get-ChildItem $dest -Directory -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Host "Copied $n skill(s) into the sandbox (CLI + Desktop merged)."
