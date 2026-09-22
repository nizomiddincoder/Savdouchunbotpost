@echo off
title PRINTER TESTI
cd /d "%~dp0print-agent"

if not exist node_modules\ws (
  call npm install
)

echo Test chek chop etilmoqda, printer yonida turing...
node agent.js --test
echo.
echo Agar chek chiqmadi bo'lsa, yuqoridagi xato xabarini o'qing.
pause
