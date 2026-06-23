# WASM Sandbox - Secure Third-Party Parser Execution

**Production-ready WebAssembly sandbox for executing community-developed contract parsers with zero host capabilities and strict resource limits.**

## Quick Links

- 📖 **[Architecture Documentation](./WASM_SANDBOX_ARCHITECTURE.md)** - Deep dive into security mechanisms
- 👥 **[Community Parser Guide](./COMMUNITY_PARSER_GUIDE.md)** - Write your own parser
- 🧪 **[Example Parsers](./examples/rust/)** - Reference implementations

## Overview

The WASM Sandbox enables Open-Audit to safely execute **untrusted third-party code** for parsing custom Soroban smart contract events. It eliminates Remote Code Execution (RCE) risks through:

✅ **Zero Host Capabilities** - No filesystem, network, or environment access  
✅ **Memory Limits** - 16MB hard limit per execution  
✅ **Timeout Protection** - 5-second maximum execution time  
✅ **Worker Isolation** - Crashes don't affect main process  
✅ **Input/Output Validation** - Strict schema enforcement  

## Installation

```bash
# Prerequisites
npm install

# Build example WASM modules (requires Rust)
npm run wasm:build-examples
```

## Usage

### Basic Example

```typescript
import { WasmSandboxRunner } from "./lib/wasm-sandbox/wasm-sandbox-runner";

const runner = new WasmSandboxRunner();

const result = await runner.execute(
  "./parsers/my-contract-parser.wasm",
  {
    data: JSON.stringify({ from: "G...", to: "G...", amount: "1000000" }),
    contractId: "CDLZ...YSC",
    eventType: "transfer"
  }
);

if (result.success) {
  console.log(result.output.description);  // "Transferred 1000000..."
  console.log(result.stats.executionTimeMs);  // 85
} else {
  console.error(result.error.message);
}
```

### Integration with Translation System

```typescript
import { WasmSandboxRunner } from "./lib/wasm-sandbox/wasm-sandbox-runner";
import { registerWasmParser } from "./translator/wasm-registry";

// Register WASM parser for a contract
registerWasmParser({
  contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  wasmPath: "./parsers/soroswap-router.wasm",
  contractName: "Soroswap Router",
});

// Translation engine automatically uses WASM parser
const translated = await translateEvent(rawEvent);
```

## API Reference

### `WasmSandboxRunner`

#### `execute(wasmPath: string, input: WasmParserInput): Promise<WasmExecutionResult>`

Executes a WASM parser in an isolated sandbox.

**Parameters:**
- `wasmPath` - Absolute path to `.wasm` file
- `input` - Parser input data

**Returns:** `WasmExecutionResult`
```typescript
{
  success: true,
  output: {
    description: string,
    fields?: Record<string, string>,
    error?: string
  },
  error: null,
  stats: {
    executionTimeMs: number,
    peakMemoryBytes: number,
    timedOut: boolean
  }
}
```

**Error Types:**
- `LOAD_FAILED` - File not found or read error
- `INSTANTIATION_FAILED` - WASM compilation failed
- `INVALID_EXPORTS` - Missing required exports
- `TIMEOUT_EXCEEDED` - Execution time > 5s
- `RUNTIME_PANIC` - WASM trap or crash
- `INVALID_INPUT` - Input validation failed
- `INVALID_OUTPUT` - Output validation failed

#### `clearCache(): void`

Clears the compiled module cache.

## Testing

### Run Test Suite

```bash
# All WASM sandbox tests
npm run test:wasm

# Watch mode
npm run test:wasm:watch

# Manual testing
npm run test:wasm:manual          # Test valid parser
npm run test:wasm:manual malicious  # Test security mechanisms
npm run test:wasm:manual custom ./my-parser.wasm  # Test custom parser

# Performance benchmark
npm run test:wasm:benchmark
```

### Test Coverage

- ✅ Valid parser execution (various input formats)
- ✅ Input validation (size limits, required fields)
- ✅ Output validation (structure, size limits)
- ✅ Timeout protection (infinite loops)
- ✅ Memory limits (allocation guards)
- ✅ Resource isolation (no filesystem/network/env)
- ✅ Error handling (corrupted WASM, missing exports)
- ✅ Module caching (performance optimization)
- ✅ Concurrent execution

## Security Mechanisms

### 1. Zero Host Capabilities

```typescript
// WASM import object provides ONLY memory
const imports = {
  env: {
    memory,  // Linear memory for data passing
    abort: () => { throw new Error("abort"); }  // Minimal handler
  }
  // NO fs, NO net, NO env, NO process
};
```

### 2. Memory Limits

```typescript
const memory = new WebAssembly.Memory({
  initial: 1,      // 64KB
  maximum: 256,    // 16MB (hard limit)
});
```

### 3. Timeout Protection

```typescript
const timeout = setTimeout(() => {
  worker.terminate();  // Forcibly kill worker thread
}, 5000);
```

### 4. Input/Output Validation

```typescript
// Input: Max 1MB
if (inputSize > MAX_INPUT_SIZE_BYTES) {
  throw new WasmExecutionError("Input too large", "INVALID_INPUT");
}

// Output: Max 1MB, required structure
if (!output.description) {
  throw new WasmExecutionError("Invalid output", "INVALID_OUTPUT");
}
```

### 5. Worker Thread Isolation

```typescript
// Each execution runs in isolated Worker
const worker = new Worker("wasm-sandbox-worker.js", {
  workerData: { moduleBytes, input, maxMemoryPages }
});
```

## Resource Limits

| Resource | Limit | Enforcement |
|----------|-------|-------------|
| Memory | 16 MB | `WebAssembly.Memory` max parameter |
| Execution Time | 5 seconds | Worker termination timer |
| Input Size | 1 MB | Pre-validation |
| Output Size | 1 MB | Post-validation |
| Stack Depth | WASM default | Browser/runtime limits |

## Performance

### Execution Overhead

```
First execution:  ~80-150ms  (compile + execute)
Cached execution: ~60-100ms  (execute only)
Overhead:         ~20-50ms   (worker spawn + serialization)
```

### Benchmarks

```
Simple parse (100 bytes):   ~80ms
Complex parse (10KB):       ~120ms
Large parse (100KB):        ~250ms
Concurrent (5 parsers):     ~400ms total
```

### Optimization

- ✅ Module caching (compiled WASM reused)
- ⏳ Worker pooling (future enhancement)
- ⏳ Streaming execution (future enhancement)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Main Thread                          │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │         WasmSandboxRunner                        │  │
│  │  • Module loading & caching                      │  │
│  │  • Input/output validation                       │  │
│  │  • Worker orchestration                          │  │
│  │  • Timeout enforcement                           │  │
│  └──────────────────────────────────────────────────┘  │
│                         │                               │
│                         ▼                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │        Worker Thread                             │  │
│  │  ┌────────────────────────────────────────────┐  │  │
│  │  │    WebAssembly Instance                    │  │  │
│  │  │  • Linear memory (16MB max)                │  │  │
│  │  │  • Parser logic                            │  │  │
│  │  │  • Zero host capabilities                  │  │  │
│  │  └────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

See [WASM_SANDBOX_ARCHITECTURE.md](./WASM_SANDBOX_ARCHITECTURE.md) for detailed architecture documentation.

## Writing Custom Parsers

### Prerequisites

- Rust (1.70+)
- `wasm32-unknown-unknown` target

### Quick Start

```bash
# Create parser project
cargo new --lib my-parser
cd my-parser

# Edit Cargo.toml (see examples/rust/valid-parser/Cargo.toml)

# Implement parser (see COMMUNITY_PARSER_GUIDE.md)

# Build WASM
cargo build --target wasm32-unknown-unknown --release

# Test
node scripts/test-wasm-sandbox.js custom ./target/wasm32-unknown-unknown/release/my_parser.wasm
```

### Required Exports

```rust
#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8;

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize);

#[no_mangle]
pub extern "C" fn parse(input_ptr: *const u8, input_len: usize) -> *mut u8;

#[no_mangle]
pub extern "C" fn getOutputLength() -> usize;
```

See [COMMUNITY_PARSER_GUIDE.md](./COMMUNITY_PARSER_GUIDE.md) for complete guide.

## Examples

### Valid Parser

See [examples/rust/valid-parser/](./examples/rust/valid-parser/) for a complete reference implementation that:
- Implements required API contract
- Parses JSON contract data
- Handles errors gracefully
- Formats output correctly

### Malicious Parser (Security Testing)

See [examples/rust/malicious-parser/](./examples/rust/malicious-parser/) for intentionally malicious parsers that test security mechanisms:
- Infinite loop (tests timeout)
- Memory bomb (tests memory limits)
- Stack overflow (tests recursion limits)

## Troubleshooting

### Error: WASM file not found

```bash
# Build example WASM modules
cd lib/wasm-sandbox/examples/rust
./build-all.sh  # Linux/Mac
build-all.bat   # Windows
```

### Error: TIMEOUT_EXCEEDED

Your parser is taking > 5 seconds. Optimize your algorithm or reduce input size.

### Error: INVALID_EXPORTS

Your WASM must export: `alloc`, `dealloc`, `parse`, `getOutputLength`

### Error: INVALID_OUTPUT

Output must be JSON with required `description` field:
```json
{
  "description": "...",
  "fields": { ... },
  "error": null
}
```

## Contributing

### Adding New Parsers

1. Create WASM parser (Rust/AssemblyScript)
2. Test locally: `npm run test:wasm:manual custom ./my-parser.wasm`
3. Submit PR with:
   - WASM binary (`parsers/my-parser.wasm`)
   - Registration code (`lib/translator/wasm-registry.ts`)
   - Tests (`lib/wasm-sandbox/__tests__/my-parser.test.ts`)
   - Documentation

### Improving Security

- Report vulnerabilities: security@open-audit.io
- Submit PRs for additional security tests
- Propose new resource limits or mechanisms

### Performance Optimization

- Profile WASM execution overhead
- Implement worker pooling
- Add streaming support for large inputs

## Roadmap

### Short-term
- [x] Core sandbox implementation
- [x] Security mechanisms (timeout, memory, isolation)
- [x] Example parsers (valid, malicious)
- [x] Comprehensive test suite
- [x] Architecture documentation
- [ ] Integration with translation registry
- [ ] Community parser submission workflow

### Long-term
- [ ] Worker pooling for reduced overhead
- [ ] Streaming execution for large inputs
- [ ] Gas metering for deterministic limits
- [ ] AssemblyScript support
- [ ] Browser-based parser playground
- [ ] Formal verification of security properties

## Support

- **Documentation:** [WASM_SANDBOX_ARCHITECTURE.md](./WASM_SANDBOX_ARCHITECTURE.md)
- **Community Guide:** [COMMUNITY_PARSER_GUIDE.md](./COMMUNITY_PARSER_GUIDE.md)
- **GitHub Issues:** [Open-Audit/issues](https://github.com/yourusername/Open-Audit/issues)
- **Discord:** `#wasm-sandbox` channel
- **Email:** support@open-audit.io

## License

MIT License - See LICENSE file for details

## Credits

Built with:
- [WebAssembly](https://webassembly.org/)
- [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html)
- [Rust](https://www.rust-lang.org/)
- [stellar-sdk](https://github.com/stellar/js-stellar-sdk)

---

**🔒 Security-first. 🚀 Performance-optimized. 👥 Community-driven.**
