@echo off
chcp 65001 >nul
title EduCenter Pro - إيقاف النظام
cd /d "%~dp0"

echo جارٍ إيقاف نظام EduCenter Pro وإنهاء جميع العمليات في الخلفية...

:: إيقاف أي سيرفر يعمل على المنفذ 5173
powershell -Command "Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

:: إيقاف عمليات Electron إن وجدت
taskkill /f /im electron.exe >nul 2>&1

echo.
echo [✓] تم إيقاف النظام وسيرفر الخلفية بنجاح.
timeout /t 2 /nobreak >nul
exit
