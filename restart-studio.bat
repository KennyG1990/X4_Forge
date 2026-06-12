@echo off
REM ============================================================
REM  X4:MD Studio - clean restart (split dev servers)
REM    API server : http://localhost:3001  (Express, /api/* only)
REM    Web / Vite : http://localhost:3000  (UI + HMR, proxies /api -> 3001)
REM
REM  >>> Open http://localhost:3000 in your browser <<<
REM
REM  Two windows will open (API and Web). Leave BOTH running.
REM  Editing backend code restarts only the API window now -
REM  the browser page no longer reloads when that happens.
REM  Close both windows to stop the studio.
REM ============================================================

echo Stopping anything on ports 3000 and 3001...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo   killing PID %%a ^(3000^)
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do (
    echo   killing PID %%a ^(3001^)
    taskkill /F /PID %%a >nul 2>&1
)

cd /d "%~dp0"

echo.
echo Installing/updating dependencies (npm install)...
call npm install
if errorlevel 1 (
    echo npm install reported an error - check the output above.
    pause
    exit /b 1
)

echo.
echo Starting API server (port 3001)...
start "X4 API (3001)" cmd /k "set API_ONLY=true&& set PORT=3001&& npm run dev:api"

echo Starting Web / Vite server (port 3000)...
start "X4 Web (3000)" cmd /k "npm run dev:web"

echo.
echo Both servers are starting in their own windows.
echo Wait for the Web window to report "Local:  http://localhost:3000/",
echo then open http://localhost:3000 in your browser.
echo.
echo This launcher window can be closed; the two server windows must stay open.
pause >nul
