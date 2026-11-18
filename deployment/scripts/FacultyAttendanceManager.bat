@echo off
start "" powershell.exe -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "%~dp0FacultyAttendanceManager.ps1"
exit /b 0
