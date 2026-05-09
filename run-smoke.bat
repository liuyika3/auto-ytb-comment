@echo off
cd /d "%~dp0"
set HTTPS_PROXY=http://127.0.0.1:9876
set HTTP_PROXY=http://127.0.0.1:9876
if not exist node_modules call npm install
call npm run smoke
pause
