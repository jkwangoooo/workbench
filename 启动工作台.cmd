@echo off
chcp 65001 >nul
setlocal
title Teacher Workbench - Local

rem ============================================================
rem  Teacher Workbench launcher (double-click me)
rem
rem  Everything below is plain ASCII on purpose: cmd.exe reads
rem  .cmd files in the OEM codepage, so non-ASCII literals here
rem  can turn into garbage. Chinese messages come from Node,
rem  which writes UTF-8 (chcp 65001 above makes them readable).
rem
rem  Control flow uses `goto` labels instead of if(...) blocks:
rem  parenthesized blocks inside a batch file are fragile, and a
rem  plain jump is easier to reason about when it fails.
rem
rem  This file must keep CRLF line endings - see .gitattributes.
rem ============================================================

rem Always run from the folder this script lives in.
cd /d "%~dp0"

echo.
echo ========================================
echo   Teacher Workbench / Local Edition
echo ========================================
echo.

rem ---- 1. locate Node ----
set "NODE_EXE="
for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%i"

if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"

if not defined NODE_EXE goto no_node

rem ---- 2. first run: install dependencies ----
if exist "node_modules\xlsx" goto run
echo [*] First run detected - installing dependencies...
echo.
call npm install
if errorlevel 1 goto npm_failed
echo.

rem ---- 3. hand over to the Node launcher ----
:run
"%NODE_EXE%" "%~dp0scripts\launch.mjs"
set "CODE=%ERRORLEVEL%"

if "%CODE%"=="0" goto done
echo.
echo [!] Launcher exited with code %CODE%.
echo.
pause

:done
rem endlocal + exit on ONE line: %CODE% must be expanded before endlocal discards it.
endlocal & exit /b %CODE%

:no_node
echo [X] Node.js not found.
echo.
echo     Install Node.js LTS from https://nodejs.org/ then run this again.
echo.
pause
exit /b 1

:npm_failed
echo.
echo [X] npm install failed. Check the network or proxy, then retry.
echo.
pause
exit /b 1