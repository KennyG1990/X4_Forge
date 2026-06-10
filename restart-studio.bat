@echo off
REM ============================================================
REM  X4 MD Studio - clean restart
REM  Force-stops whatever is holding port 3000, then starts a
REM  fresh dev server so new server.ts routes are loaded.
REM  Leave this window open while you use the studio.
REM ============================================================

echo Stopping any existing server on port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo   killing PID %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo Starting X4 MD Studio dev server...
echo (Wait for: "X4 Mod Studio Dev Server running on http://localhost:3000")
echo.

cd /d "%~dp0"
call npm run dev

echo.
echo Server stopped. Press any key to close.
pause >nul
