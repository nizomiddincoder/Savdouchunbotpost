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
if "%errorlevel%"=="42" goto dup
echo.
echo Agent to'xtab qoldi, 3 soniyadan keyin o'zi qaytadan ishga tushadi...
ping -n 4 127.0.0.1 >nul
goto loop

:dup
echo.
echo Agent allaqachon ishlayapti - bu oyna o'zi yopiladi.
ping -n 6 127.0.0.1 >nul
