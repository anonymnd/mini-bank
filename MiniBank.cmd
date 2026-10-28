@echo off
wsl.exe -d Ubuntu --cd "%~dp0." -- bash tools/run.sh %*
set "MINIBANK_EXIT=%ERRORLEVEL%"
if not "%MINIBANK_EXIT%"=="0" if "%~1"=="" pause
exit /b %MINIBANK_EXIT%
