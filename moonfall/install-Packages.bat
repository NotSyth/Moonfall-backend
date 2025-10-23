@echo off
setlocal enabledelayedexpansion
title Moonfall Install

set ROOT=%~dp0
set NODE_VER=20.17.0
set VENDOR=%ROOT%vendor
set NODE_DIR=%VENDOR%\node
if not exist "%VENDOR%" mkdir "%VENDOR%"
if not exist "%NODE_DIR%" mkdir "%NODE_DIR%"

where node >nul 2>nul
if errorlevel 1 (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "[System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLower()"`) do set ARCH=%%A
  if /i "%ARCH%"=="arm64" (set NODE_ARCH=arm64) else (set NODE_ARCH=x64)
  set NODE_ZIP=node-v%NODE_VER%-win-%NODE_ARCH%.zip
  set NODE_URL=https://nodejs.org/dist/v%NODE_VER%/%NODE_ZIP%
  echo Downloading Node.js %NODE_VER% (%NODE_ARCH%)...
  powershell -NoProfile -Command "Invoke-WebRequest '%NODE_URL%' -OutFile '%TEMP%\%NODE_ZIP%'"
  echo Extracting Node.js...
  powershell -NoProfile -Command "Expand-Archive -Path '%TEMP%\%NODE_ZIP%' -DestinationPath '%NODE_DIR%' -Force"
  set NODE_HOME=%NODE_DIR%\node-v%NODE_VER%-win-%NODE_ARCH%
  set PATH=%NODE_HOME%;%PATH%
) else (
  echo Using existing Node.js
)

for /f "tokens=1*" %%V in ('node -v 2^>nul') do set NODE_FOUND=%%V
if not defined NODE_FOUND (
  echo Node.js not available. Aborting.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm not found in PATH. Aborting.
  exit /b 1
)

if not exist "%ROOT%package.json" (
  echo Creating package.json...
  powershell -NoProfile -Command ^
    "$j=@{name='moonfall-backend';version='1.0.0';type='module';main='index.js';scripts=@{start='node index.js';dev='node index.js'}}; $j|ConvertTo-Json -Depth 5|Out-File -Encoding utf8 '%ROOT%package.json'"
)

if not exist "%ROOT%.env" (
  echo Creating .env...
  >"%ROOT%.env" echo MONGO_URI=mongodb://127.0.0.1:27017/moonfall
  >>"%ROOT%.env" echo PORT=3551
  >>"%ROOT%.env" echo JWT_SECRET=moonfall_jwt
  >>"%ROOT%.env" echo MOONFALL_GS_SECRET=moonfall_gs
)

echo Installing dependencies...
call npm i hono @hono/node-server mongodb bcrypt jsonwebtoken uuid dotenv ws

echo Installing dev tools...
call npm i -D nodemon

if not exist "%ROOT%data" mkdir "%ROOT%data"
if not exist "%ROOT%config" mkdir "%ROOT%config"
if not exist "%ROOT%CloudStorage" mkdir "%ROOT%CloudStorage"

echo Done.
pause