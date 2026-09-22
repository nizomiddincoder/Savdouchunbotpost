@echo off
title CHEK PRINT AGENTI
cd /d "%~dp0print-agent"

if not exist node_modules\ws (
  echo Birinchi marta ishga tushirilmoqda, kutib turing...
  call npm install
)

echo ============================================
echo   CHEK PRINT AGENTI ISHGA TUSHDI
echo   Bu oynani YOPIVMANG - ishlayveradi.
echo   Ochirish uchun: shu oynani yoping.
echo ============================================

:loop
node agent.js
echo.
echo Agent to'xtab qoldi, 3 soniyadan keyin o'zi qaytadan ishga tushadi...
timeout /t 3 /nobreak >nul
goto loop
