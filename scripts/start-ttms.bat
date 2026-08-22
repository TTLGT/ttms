@echo off
REM ===================================================================
REM  Start TTMS on this computer.
REM
REM  Double-click this file (or a shortcut to it) to start the system.
REM  It opens the browser for you once the server is ready.
REM
REM  To stop TTMS: click this black window and press Ctrl and C together,
REM  or just close the window.
REM
REM  Written for people who do not use the command line. Every failure
REM  below prints what to do next rather than a raw error.
REM ===================================================================

title TTMS - do not close while you are using the system
cd /d "%~dp0.."

echo.
echo   TTMS
echo   ----------------------------------------------------
echo   Folder: %CD%
echo.

REM --- Is Node.js installed? ------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo   PROBLEM: Node.js is not installed on this computer.
  echo.
  echo   Fix it: go to  https://nodejs.org  and install the version
  echo   marked LTS, accepting every default. Then restart this computer
  echo   and double-click this file again.
  echo.
  pause
  exit /b 1
)

REM --- Is the settings file present? -----------------------------------
if not exist ".env.local" (
  echo   PROBLEM: the settings file is missing.
  echo.
  echo   TTMS cannot start without a file named  .env.local  in:
  echo   %CD%
  echo.
  echo   Fix it: ask whoever set up TTMS for this file. It holds the
  echo   passwords that connect to the database. Do not try to write it
  echo   yourself, and do not send it over email or chat.
  echo.
  pause
  exit /b 1
)

REM --- Are the supporting files installed? ------------------------------
if not exist "node_modules" (
  echo   First-time setup: downloading supporting files.
  echo   This takes a few minutes. Warnings in yellow are normal.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   PROBLEM: the download did not finish.
    echo   Check that this computer is on the internet, then try again.
    echo.
    pause
    exit /b 1
  )
  echo.
)

REM --- Open the browser once the server has had time to start ----------
REM Detached so it does not hold up the server starting in this window.
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 8; Start-Process 'http://localhost:3000'"

echo   Starting up. Your browser will open in about 8 seconds.
echo.
echo   LEAVE THIS WINDOW OPEN while you use TTMS.
echo   To stop: press Ctrl and C together, or close this window.
echo   ----------------------------------------------------
echo.

call npm run dev

REM --- Only reached if the server stopped or refused to start ----------
echo.
echo   ----------------------------------------------------
echo   TTMS has stopped.
echo.
echo   If you pressed Ctrl+C or closed the browser, this is normal.
echo   If it stopped on its own, read the message above this line.
echo   "EADDRINUSE" or "port 3000 is in use" means TTMS is already
echo   running in another window - use that one instead.
echo.
pause
