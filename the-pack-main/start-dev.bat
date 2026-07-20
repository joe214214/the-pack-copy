@echo off
setlocal enabledelayedexpansion
REM ThePack dev server launcher.
REM Port 3000 fell into a Windows reserved range (netsh excludedportrange), so we
REM standardize on 3100. The sandbox (thepack-mcpb/sandbox/.env) points at
REM host.docker.internal:3100 to match.
set PORT=3100

REM Auto-detect this machine's current LAN IPv4 (Wi-Fi/Ethernet; skip loopback,
REM link-local 169.254.*, and WSL/Docker/virtual adapters; prefer Wi-Fi). Using
REM the LAN IP (not localhost) makes delivered/input file links open from OTHER
REM devices on the same WiFi. Because it's detected fresh each launch, a changed
REM router IP just needs a relaunch — nothing to edit by hand.
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notmatch 'WSL|Docker|vEthernet|Loopback' } | Sort-Object -Property @{Expression={$_.InterfaceAlias -like 'Wi-Fi*'};Descending=$true} | Select-Object -First 1 -ExpandProperty IPAddress)"`) do set LANIP=%%i

if "%LANIP%"=="" (
  echo WARNING: could not auto-detect a LAN IP; falling back to localhost.
  echo Other devices will NOT be able to open delivered images.
  set LANIP=localhost
)

set NEXT_PUBLIC_APP_URL=http://%LANIP%:3100
echo ============================================================
echo   ThePack starting on:  http://%LANIP%:3100
echo   Same-WiFi devices:    open http://%LANIP%:3100
echo ============================================================
npm run dev
