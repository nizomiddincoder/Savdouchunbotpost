@echo off
rem Avtostartni YOQISH: kompyuter yonganda print agenti o'zi ishga tushadi.
rem Bu yorliqni Windows'ning Startup papkasiga qo'shadi (bir marta bajarilsa yetarli).
powershell -NoProfile -Command "$s = [Environment]::GetFolderPath('Startup'); $lnk = Join-Path $s 'Chek Print Agenti.lnk'; $ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut($lnk); $sc.TargetPath = '%~dp0PRINTERNI ISHGA TUSHIRISH.bat'; $sc.WorkingDirectory = '%~dp0'; $sc.Description = 'Savdo chek print agenti (avtostart)'; $sc.WindowStyle = 7; $sc.Save(); Write-Host 'TAYYOR:' $lnk"
echo.
echo Kompyuter endi yonganda agent O'ZI ishga tushadi.
echo (Ochirish uchun: AVTOSTART NI OCHIRISH.bat ni bosing)
pause
