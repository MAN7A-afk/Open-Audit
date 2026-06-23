@echo off
REM Build script for all WASM parser examples (Windows)
REM Creates optimized WASM binaries for testing

echo ================================================
echo Building WASM Parser Examples
echo ================================================

REM Check if Rust is installed
where cargo >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Rust is not installed
    echo Install from: https://rustup.rs
    exit /b 1
)

REM Check if wasm32 target is installed
rustup target list | findstr /C:"wasm32-unknown-unknown (installed)" >nul
if %ERRORLEVEL% NEQ 0 (
    echo Installing wasm32-unknown-unknown target...
    rustup target add wasm32-unknown-unknown
)

REM Create output directory
if not exist "..\compiled" mkdir "..\compiled"

echo.
echo Building valid-parser...
cd valid-parser
cargo build --target wasm32-unknown-unknown --release
copy target\wasm32-unknown-unknown\release\valid_parser.wasm ..\..\compiled\ >nul
echo Valid-parser built successfully

echo.
echo Building malicious-parser...
cd ..\malicious-parser
cargo build --target wasm32-unknown-unknown --release
copy target\wasm32-unknown-unknown\release\malicious_parser.wasm ..\..\compiled\ >nul
echo Malicious-parser built successfully

cd ..

echo.
echo ================================================
echo All WASM modules built successfully!
echo ================================================
echo.
echo Output files:
dir /B ..\..\compiled\*.wasm

echo.
echo Next steps:
echo   1. Run tests: npm test -- wasm-sandbox-runner
echo   2. Test manually: node scripts/test-wasm-sandbox.js
