@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo Gross Printing MIS - CHECK BEFORE UPLOAD
echo ============================================================
echo.

echo [1/6] Checking Node and npm...
where node >nul 2>nul || goto :no_node
where npm.cmd >nul 2>nul || goto :no_node
node --version
call npm.cmd --version
if errorlevel 1 goto :failed

echo.
echo [2/6] Checking npm registry connection...
call npm.cmd ping
if errorlevel 1 goto :network_failed

echo.
echo [3/6] Installing the exact locked dependencies...
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto :failed

echo.
echo [4/6] Running security checks...
call npm.cmd run securitycheck
if errorlevel 1 goto :failed

echo.
echo [5/6] Running TypeScript check...
call npm.cmd run typecheck
if errorlevel 1 goto :failed

echo.
echo [6/6] Running the full Next.js production build...
call npm.cmd run build
if errorlevel 1 goto :failed

echo.
echo ============================================================
echo BUILD PASSED - SAFE TO PUSH TO GITHUB / VERCEL
echo ============================================================
echo.
pause
exit /b 0

:no_node
echo.
echo Node.js or npm was not found on this computer.
echo Install Node.js, reopen this folder, and run this checker again.
goto :failed_end

:network_failed
echo.
echo npm could not reach the registry.
echo This is an Internet/DNS/firewall/proxy problem, not a project code error.
echo Try again when the connection is working.
goto :failed_end

:failed
echo.
echo ============================================================
echo BUILD FAILED - DO NOT PUSH THIS VERSION TO VERCEL
echo The error above tells us exactly what must be fixed.
echo ============================================================

:failed_end
echo.
pause
exit /b 1
