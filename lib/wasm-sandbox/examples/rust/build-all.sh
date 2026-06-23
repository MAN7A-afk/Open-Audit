#!/bin/bash

# Build script for all WASM parser examples
# Creates optimized WASM binaries for testing

set -e

echo "================================================"
echo "Building WASM Parser Examples"
echo "================================================"

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Error: Rust is not installed"
    echo "Install from: https://rustup.rs"
    exit 1
fi

# Check if wasm32 target is installed
if ! rustup target list | grep -q "wasm32-unknown-unknown (installed)"; then
    echo "📦 Installing wasm32-unknown-unknown target..."
    rustup target add wasm32-unknown-unknown
fi

# Create output directory
mkdir -p ../compiled

echo ""
echo "📦 Building valid-parser..."
cd valid-parser
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/valid_parser.wasm ../../compiled/
echo "✅ valid-parser built successfully"

echo ""
echo "📦 Building malicious-parser..."
cd ../malicious-parser
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/malicious_parser.wasm ../../compiled/
echo "✅ malicious-parser built successfully"

echo ""
echo "================================================"
echo "✅ All WASM modules built successfully!"
echo "================================================"
echo ""
echo "Output files:"
ls -lh ../../compiled/*.wasm

echo ""
echo "Next steps:"
echo "  1. Run tests: npm test -- wasm-sandbox-runner"
echo "  2. Test manually: node scripts/test-wasm-sandbox.js"
