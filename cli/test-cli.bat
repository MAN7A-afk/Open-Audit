@echo off
REM Test script for open-audit-cli (Windows)
REM Runs example test cases to verify CLI functionality

setlocal enabledelayedexpansion

echo ================================================
echo Testing open-audit-cli
echo ================================================
echo.

set TESTS_RUN=0
set TESTS_PASSED=0

REM Build CLI first
echo Building CLI...
call npm run build:cli
echo.

REM Test 1: Help command
echo Test 1: Help command
node dist\cli\open-audit-cli.js --help >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo PASSED
    set /a TESTS_PASSED+=1
) else (
    echo FAILED
)
set /a TESTS_RUN+=1
echo.

REM Test 2: Version command
echo Test 2: Version command
node dist\cli\open-audit-cli.js --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo PASSED
    set /a TESTS_PASSED+=1
) else (
    echo FAILED
)
set /a TESTS_RUN+=1
echo.

REM Test 3: Valid transfer event (JSON)
echo Test 3: Valid transfer event (JSON)
node dist\cli\open-audit-cli.js test --hex 0x74726e7312345678 --spec cli\examples\token-transfer.json >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo PASSED
    set /a TESTS_PASSED+=1
) else (
    echo FAILED
)
set /a TESTS_RUN+=1
echo.

REM Test 4: Valid transfer event (YAML)
echo Test 4: Valid transfer event (YAML)
node dist\cli\open-audit-cli.js test --hex 0x74726e73 --spec cli\examples\token-transfer.yaml >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo PASSED
    set /a TESTS_PASSED+=1
) else (
    echo FAILED
)
set /a TESTS_RUN+=1
echo.

REM Test 5: Missing required option (should fail)
echo Test 5: Missing --hex option (should fail)
node dist\cli\open-audit-cli.js test --spec cli\examples\token-transfer.json >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo PASSED (correctly failed)
    set /a TESTS_PASSED+=1
) else (
    echo FAILED (should have failed)
)
set /a TESTS_RUN+=1
echo.

REM Summary
echo ================================================
echo Test Summary
echo ================================================
echo Tests run: %TESTS_RUN%
echo Tests passed: %TESTS_PASSED%
set /a TESTS_FAILED=%TESTS_RUN%-%TESTS_PASSED%
echo Tests failed: %TESTS_FAILED%

if %TESTS_PASSED% EQU %TESTS_RUN% (
    echo All tests passed!
    exit /b 0
) else (
    echo Some tests failed
    exit /b 1
)
