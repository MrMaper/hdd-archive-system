@echo off
chcp 65001 >nul 2>&1
title HDD Archive Server - Python

echo ╔════════════════════════════════════╗
echo ║    HDD Archive System - Python     ║
echo ╠════════════════════════════════════╣
echo ║  Server: http://localhost:8765     ║
echo ║  Ctrl+C to stop                   ║
echo ╚════════════════════════════════════╝
echo.

start http://localhost:8765

timeout /t 2 /nobreak >nul

python "h:\_archive_system\server.py" --port 8765

pause