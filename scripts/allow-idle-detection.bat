@echo off
REM ===================================================================
REM  Let TTMS see whether this computer is in use, without asking.
REM
REM  Right-click this file and choose "Run as administrator". Run it once
REM  on each computer staff clock in from. It covers Chrome and Edge for
REM  every Windows user on the computer.
REM
REM  What it allows: the TTMS site - and only that site - may ask Chrome
REM  or Edge "has anyone used the keyboard or mouse in the last minute,
REM  and is the screen locked?". Nothing else: not which programs are
REM  open, not what is typed, not what is on screen. TTMS only asks while
REM  the person is clocked in. See src/lib/idleDetection.ts.
REM
REM  It is the same setting as IdleDetectionAllowedForUrls in the Google
REM  Admin console, written on the computer itself, because the console
REM  does not offer it for Chrome browsers. Afterwards the browsers show
REM  "Managed by your organization" in their menu; that is this setting.
REM
REM  To take it off again:  allow-idle-detection.bat /remove
REM  (also as administrator).
REM ===================================================================

setlocal
set "SITE=https://ttms.totaltransportlogistics.us"
set "CHROME=HKLM\SOFTWARE\Policies\Google\Chrome\IdleDetectionAllowedForUrls"
set "EDGE=HKLM\SOFTWARE\Policies\Microsoft\Edge\IdleDetectionAllowedForUrls"

title TTMS - allow activity detection

REM --- Running as administrator? --------------------------------------
net session >nul 2>nul
if errorlevel 1 (
  echo.
  echo   PROBLEM: this needs to run as administrator.
  echo.
  echo   Fix it: close this window, right-click the file, and choose
  echo   "Run as administrator". Click Yes when Windows asks.
  echo.
  pause
  exit /b 1
)

if /i "%~1"=="/remove" goto remove

REM The value is named "1" because each allowed site is a numbered entry.
REM A computer that already allows another site under "1" would lose it;
REM none of ours do, and TTMS is the only site this list is used for.
reg add "%CHROME%" /v 1 /t REG_SZ /d "%SITE%" /f >nul
if errorlevel 1 goto failed
reg add "%EDGE%" /v 1 /t REG_SZ /d "%SITE%" /f >nul
if errorlevel 1 goto failed

echo.
echo   Done. Chrome and Edge on this computer will no longer ask.
echo.
echo   Close every Chrome and Edge window and open them again for it to
echo   take effect. To check: type  chrome://policy  (or  edge://policy)
echo   in the address bar and look for IdleDetectionAllowedForUrls.
echo.
pause
exit /b 0

:remove
reg delete "%CHROME%" /v 1 /f >nul 2>nul
reg delete "%EDGE%" /v 1 /f >nul 2>nul
echo.
echo   Removed. Chrome and Edge will ask again (once) at the next clock-in.
echo   Close and reopen the browsers for it to take effect.
echo.
pause
exit /b 0

:failed
echo.
echo   PROBLEM: Windows would not save the setting.
echo.
echo   Fix it: make sure you chose "Run as administrator". If you did,
echo   send a photo of this window to IT.
echo.
pause
exit /b 1
