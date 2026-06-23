# WASM Parser Examples (Rust)

This directory contains example WASM parsers written in Rust to demonstrate and test the WASM sandbox security mechanisms.

## Prerequisites

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add WebAssembly target
rustup target add wasm32-unknown-unknown
```

## Building the Examples

### Valid Parser (Reference Implementation)

```bash
cd valid-parser
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/valid_parser.wasm ../../compiled/
```

### Malicious Parser (Security Testing)

```bash
cd malicious-parser
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/malicious_parser.wasm ../../compiled/
```

### Build All (Helper Script)

```bash
# From this directory (examples/rust)
./build-all.sh
```

## Parser API Contract

All WASM parsers must implement this interface:

### Required Exports

```rust
/// Allocates `size` bytes in linear memory and returns the pointer
pub extern "C" fn alloc(size: usize) -> *mut u8

/// Deallocates memory at `ptr` with the given `size`
pub extern "C" fn dealloc(ptr: *mut u8, size: usize)

/// Parses input and returns pointer to output JSON string
/// Input: JSON string at `input_ptr` with length `input_len`
/// Output: Pointer to output JSON string in linear memory
pub extern "C" fn parse(input_ptr: *const u8, input_len: usize) -> *mut u8

/// Returns the length of the output string from the last parse() call
pub extern "C" fn getOutputLength() -> usize
```

### Input Schema

```json
{
  "data": "string",           // Raw contract data (JSON or hex)
  "contractId": "string",     // Stellar contract ID (C...)
  "eventType": "string?"      // Optional event type hint
}
```

### Output Schema

```json
{
  "description": "string",    // Human-readable event description
  "fields": {                 // Optional structured fields
    "key": "value"
  },
  "error": "string?"          // Optional error message
}
```

## Testing the Parsers

```typescript
import { WasmSandboxRunner } from "../../wasm-sandbox-runner";

const runner = new WasmSandboxRunner();

// Test valid parser
const result = await runner.execute(
  "lib/wasm-sandbox/compiled/valid_parser.wasm",
  {
    data: JSON.stringify({ amount: "1000000", from: "GABC..." }),
    contractId: "CDLZ...YSC",
    eventType: "transfer",
  }
);

console.log(result.success); // true
console.log(result.output.description); // "Parsed event from contract..."
```

## Security Testing

The malicious parser provides several attack variants:

1. **Infinite Loop** - Tests timeout protection (5s max)
2. **Memory Bomb** - Tests memory limits (16MB max)
3. **Stack Overflow** - Tests recursion limits
4. **Integer Overflow** - Tests allocation overflow handling
5. **Out of Bounds** - Tests memory bounds checking
6. **Null Deref** - Tests trap handling

All attacks should be safely contained and result in graceful error handling.

## File Sizes

Rust WASM binaries are typically:
- Valid parser: ~15-30KB (optimized)
- Malicious parser: ~10-20KB (optimized)

Optimization flags in `Cargo.toml` minimize binary size while maintaining functionality.

## Notes

- No `std::io` or `std::fs` - These would require WASI which we explicitly don't provide
- No `std::net` - Network access is not available
- No `std::env` - Environment variables are not accessible
- Linear memory only - All host-guest communication via memory pointers
- No imports beyond `memory` and minimal `abort` handler
