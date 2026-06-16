@echo off
REM One-click launcher: relaunches the X4 Forge dev server by calling the
REM real restart script with an absolute path (works no matter where this is run from).
REM Double-click this file, then wait for the Web window to print:
REM     Local:  http://localhost:3000/
echo Launching X4 Forge dev server (kills stale 3000/3001, then relaunches)...
call "C:\Users\Moshi\.gemini\antigravity-ide\scratch\X4-Foundations-Mod-Studio\restart-studio.bat"
