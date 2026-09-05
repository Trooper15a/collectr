@echo off
rem Starts the Collectr server (production build over HTTPS) and logs to data\server.log.
cd /d "%~dp0.."
if not exist data mkdir data
node server.mjs >> data\server.log 2>&1
