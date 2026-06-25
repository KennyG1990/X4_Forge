@echo off
REM One-click launcher: relaunches the X4 Forge dev server by calling the
REM real restart script next to it (works no matter where this is run from).
REM Double-click this file, then wait for the Web window to print:
REM     Local:  http://localhost:3000/
echo Launching X4 Forge dev server (kills stale 3000/3001, then relaunches)...
call "%~dp0restart-studio.bat"
