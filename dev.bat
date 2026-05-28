@echo off
setlocal
cd /d "%~dp0"
set PORT=8000

echo.
echo ============================================================
echo   STARS OF THE MIDDLE HEAVENS - LOCAL DEV SERVER
echo ============================================================
echo.
echo   Folder: %CD%
echo.

REM ── 1. Python via the py launcher (most reliable on Windows) ──
py -3 -c "import sys" >nul 2>&1
if not errorlevel 1 (
  echo [Python via py launcher detected]
  echo.
  echo   Open in browser:  http://localhost:%PORT%/
  echo   Stop server:      Ctrl+C
  echo.
  start "" "http://localhost:%PORT%/"
  py -3 -m http.server %PORT%
  goto :end
)

REM ── 2. Plain "python" (skips MS Store stub via real import test) ──
python -c "import sys" >nul 2>&1
if not errorlevel 1 (
  echo [Python detected]
  echo.
  echo   Open in browser:  http://localhost:%PORT%/
  echo   Stop server:      Ctrl+C
  echo.
  start "" "http://localhost:%PORT%/"
  python -m http.server %PORT%
  goto :end
)

REM ── 3. Node.js via npx serve ──
where npx >nul 2>&1
if not errorlevel 1 (
  echo [Node.js detected - using npx serve]
  echo   First run will download the "serve" package (~5 MB, one-time).
  echo.
  echo   Open in browser:  http://localhost:%PORT%/
  echo   Stop server:      Ctrl+C
  echo.
  start "" "http://localhost:%PORT%/"
  npx --yes serve -l %PORT% .
  goto :end
)

REM ── Nothing found ──
echo.
echo  ERROR: No local web server tool found on this system.
echo.
echo  Install ONE of these (free, ~50-100 MB):
echo.
echo    [A] Python  (recommended):  https://www.python.org/downloads/
echo        IMPORTANT: tick "Add Python to PATH" during install.
echo.
echo    [B] Node.js:                https://nodejs.org/
echo.
echo  After installing, close and re-open this window, then
echo  double-click dev.bat again.
echo.

:end
echo.
echo Server stopped.
pause
