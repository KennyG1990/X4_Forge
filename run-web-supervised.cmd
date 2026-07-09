@echo off
rem ============================================================================
rem  X4 Forge Web (Vite) — SUPERVISED (BACKLOG B3, 2026-07-09)
rem  Same self-healing loop as run-api-supervised.cmd, for the web server: if
rem  Vite ever dies (the 2026-07-09 console-death class), it relaunches after
rem  2 seconds. Exits only when you close the window.
rem ============================================================================
cd /d "%~dp0"

:loop
echo [supervisor] starting Vite web server (%date% %time%)
call npm run dev:web
echo [supervisor] web server exited (%date% %time%) - restarting in 2s >> supervisor.log
echo [supervisor] web server exited - restarting in 2 seconds (close this window to stop)
timeout /t 2 /nobreak >nul
goto loop
