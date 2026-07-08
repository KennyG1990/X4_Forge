@echo off
rem ============================================================================
rem  START X4 FORGE (production mode — no dev servers, no file watchers)
rem  G5 stage 1 (2026-07-08): run the BUILT app the way a user would.
rem
rem  - Builds the app on first run (or when you pass /rebuild)
rem  - Serves UI + API from ONE server: http://localhost:3000
rem  - Dev workflow (restart-studio.bat: tsx watch + Vite HMR) is unchanged.
rem ============================================================================
cd /d "%~dp0"

if "%1"=="/rebuild" goto build
if not exist "dist\server.cjs" goto build
if not exist "dist\index.html" goto build
goto run

:build
echo Building X4 Forge (vite build + server bundle)...
call npm run build
if errorlevel 1 (
  echo BUILD FAILED — fix errors above, or use restart-studio.bat for dev mode.
  pause
  exit /b 1
)

:run
echo Starting X4 Forge (production) at http://localhost:3000 ...
set NODE_ENV=production
node dist\server.cjs
pause
