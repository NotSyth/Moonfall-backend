@echo off
setlocal enabledelayedexpansion
title Moonfall Start
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Run install_packages.bat first.
  pause
  exit /b 1
)

for /f "usebackq delims=" %%A in (`node -e "require('dotenv').config();process.stdout.write(process.env.DISCORD_BOT_NAME||'MoonfallBot')"`) do set BOT_NAME=%%A
for /f "usebackq delims=" %%A in (`node -e "require('dotenv').config();process.stdout.write(process.env.PORT||'3551')"`) do set SVC_PORT=%%A

if not exist "logs" mkdir "logs"

start "Moonfall Backend" cmd /c node index.js ^> "logs\backend.log" 2^>^&1
if exist "DiscordBot\DiscordBot.js" (
  start "Moonfall Discord Bot" cmd /c node DiscordBot\DiscordBot.js ^> "logs\discordbot.log" 2^>^&1
)

timeout /t 2 >nul
echo %BOT_NAME% is up and running!
echo port %SVC_PORT% is now running!
pause