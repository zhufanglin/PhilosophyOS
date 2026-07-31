@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0health-dev.ps1" %*
