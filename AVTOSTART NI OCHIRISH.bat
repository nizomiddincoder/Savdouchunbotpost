@echo off
rem Avtostartni OCHIRISH: kompyuter yonganda agent o'zi ishga tushmay qoladi.
powershell -NoProfile -Command "$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Chek Print Agenti.lnk'; if (Test-Path $lnk) { Remove-Item $lnk; Write-Host 'OCHIRILDI:' $lnk } else { Write-Host 'Avtostart allaqachon ochirilgan' }"
echo.
pause
