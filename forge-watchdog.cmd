@echo off
rem ============================================================================
rem  X4 Forge WATCHDOG (BACKLOG B3, 2026-07-09)
rem  The per-process supervisors handle a crashed PROCESS, but nothing recovered
rem  a closed/killed WINDOW (lived 2026-07-09: both ports dead, console at a bare
rem  prompt, an agent session stuck until a human relaunched). This watchdog
rem  pings both ports every 20s and relaunches the missing supervised window.
rem  Two consecutive misses required, and a 60s cooldown after each respawn, so
rem  a slow boot or an intentional restart is never double-spawned.
rem ============================================================================
cd /d "%~dp0"
setlocal EnableDelayedExpansion
set MISS3000=0
set MISS3001=0

echo [watchdog] guarding http://localhost:3000 (web) and :3001 (api). Close to stop.

:loop
timeout /t 20 /nobreak >nul

netstat -aon | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 ( set /a MISS3000+=1 ) else ( set MISS3000=0 )

netstat -aon | findstr ":3001" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 ( set /a MISS3001+=1 ) else ( set MISS3001=0 )

if !MISS3000! GEQ 2 (
  echo [watchdog] port 3000 down twice - relaunching web supervisor ^(%date% %time%^) >> supervisor.log
  echo [watchdog] relaunching WEB supervisor...
  start "X4 Web (3000)" cmd /k "run-web-supervised.cmd"
  set MISS3000=0
  timeout /t 60 /nobreak >nul
)

if !MISS3001! GEQ 2 (
  echo [watchdog] port 3001 down twice - relaunching API supervisor ^(%date% %time%^) >> supervisor.log
  echo [watchdog] relaunching API supervisor...
  start "X4 API (3001)" cmd /k "run-api-supervised.cmd"
  set MISS3001=0
  timeout /t 60 /nobreak >nul
)

goto loop
