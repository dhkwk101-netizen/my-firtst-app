@echo off
title KOSIS Explorer
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Error: .venv not found.
    pause
    exit /b 1
)

echo [1/2] Opening browser...
start "" http://127.0.0.1:8000

echo [2/2] Starting server...
echo.

".venv\Scripts\python.exe" manage.py runserver 127.0.0.1:8000
pause
