@echo off
rem Starts the Collectr server (production build) and logs to data\server.log.
cd /d "%~dp0.."
if not exist data mkdir data
call npx next start -H 0.0.0.0 >> data\server.log 2>&1
