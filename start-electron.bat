@echo off
chcp 65001 >nul
title EduCenter Pro Desktop
cd /d "%~dp0"

:: تشغيل نسخة الديسك توب (Electron) فوراً وإغلاق الـ CMD
start "" npx electron .
exit
