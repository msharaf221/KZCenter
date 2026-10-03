@echo off
chcp 65001 >nul
title EduCenter Pro Launcher
cd /d "%~dp0"

:: 1. تشغيل سيرفر النظام في الخلفية بصمت تام بدون أي نافذة سوداء
powershell -WindowStyle Hidden -Command "Start-Process -WindowStyle Hidden -FilePath 'cmd.exe' -ArgumentList '/c npm run dev'"

:: 2. الانتظار ثانيتين للتأكد من قيام السيرفر المحلي
timeout /t 2 /nobreak >nul

:: 3. فتح النظام في نافذة تطبيق مستقلة بدون شريط متصفح (Edge App Mode أو Chrome أو المتصفح الافتراضي)
start msedge --app=http://localhost:5173 2>nul || start chrome --app=http://localhost:5173 2>nul || start http://localhost:5173

:: 4. إغلاق وإنهاء نافذة الـ CMD فوراً
exit
