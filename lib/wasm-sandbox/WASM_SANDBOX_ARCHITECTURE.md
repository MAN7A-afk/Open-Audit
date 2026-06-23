# WASM Sandbox Architecture

## Executive Summary

The WASM Sandbox provides a **secure, isolated execution environment** for community-developed contract parsers. It eliminates Remote Code Execution (RCE) risks by executing untrusted code as WebAssembly binaries with **zero host capabilities**, strict **resource limits**, and **worker thread isolation**.

## Security Guarantees

### 1. **Zero Host Capabilities**

WASM modules have **NO** access to:
- ❌ Filesystem (no `fs`, no file I/O)
- ❌ Network (no `fetch`, no sockets, no HTTP)
- ❌ Environment variables (no `process.env`)
- ❌ System calls (no WASI)
- ❌ JavaScript runtime (no `eval`, no dynamic code)
- ❌ Parent process state

**Only provided:** Linear memory for data passing

### 2. **Resource Limits**

| Resource | Limit | Enforcement |
|----------|-------|-------------|
| Memory | 16 MB (256 pages) | WebAssembly.Memory max parameter |
| Execution Time | 5 seconds | Worker termination timer |
| Input Size | 1 MB | Validation before execution |
| Output Size | 1 MB | Validation after execution |

### 3. **Process Isolation**

- Each execution runs in a **separate Worker thread**
- Crashes, panics, or traps **cannot affect** the main Node.js process
- Worker threads are **forcibly terminated** on timeout
- No shared memory between workers

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Main Thread                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          WasmSandboxRunner                            │  │
│  │  • Input validation                                   │  │
│  │  • Module loading & caching                           │  │
│  │  • Worker orchestration                               │  │
│  │  • Timeout enforcement                                │  │
│  │  • Result aggregation                                 │  │
│  └───────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           │ spawn Worker                     │
│                           ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         Worker Thread (wasm-sandbox-worker.js)        │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │         WebAssembly Instance                    │  │  │
│  │  │  ┌───────────────────────────────────────────┐  │  │  │
│  │  │  │    Linear Memory (16MB max)               │  │  │  │
│  │  │  │  ┌─────────────────────────────────────┐  │  │  │  │
│  │  │  │  │  Input JSON String                  │  │  │  │  │
│  │  │  │  └─────────────────────────────────────┘  │  │  │  │
│  │  │  │                  ↓                          │  │  │  │
│  │  │  │  ┌─────────────────────────────────────┐  │  │  │  │
│  │  │  │  │  WASM Parser Logic                  │  │  │  │  │
│  │  │  │  │  • alloc() / dealloc()              │  │  │  │  │
│  │  │  │  │  • parse()                          │  │  │  │  │
│  │  │  │  │  • getOutputLength()                │  │  │  │  │
│  │  │  │  └─────────────────────────────────────┘  │  │  │  │
│  │  │  │                  ↓                          │  │  │  │
│  │  │  │  ┌─────────────────────────────────────┐  │  │  │  │
│  │  │  │  │  Output JSON String                 │  │  │  │  │
│  │  │  │  └─────────────────────────────────────┘  │  │  │  │
│  │  │  └───────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           │ postMessage                      │
│                           ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Result: { success, output, stats, error }            │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Host-Guest API Contract

### Linear Memory Communication Pattern

WebAssembly only understands **numbers**. String passing requires the **linear memory allocation pattern**:

1. **Host allocates input space** via WASM's `alloc(size)`
2. **Host writes input bytes** to returned pointer
3. **Host calls parser** with `parse(ptr, len)`
4. **WASM processes data** and allocates output
5. **WASM returns output pointer**
6. **Host reads output length** via `getOutputLength()`
7. **Host reads output bytes** from memory
8. **Host deallocates** via `dealloc(ptr)`

### Required WASM Exports

```rust
/// Allocates `size` bytes in linear memory
#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8;

/// Deallocates memory at pointer
#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize);

/// Parses input and returns output pointer
#[no_mangle]
pub extern "C" fn parse(input_ptr: *const u8, input_len: usize) -> *mut u8;

/// Returns output string length
#[no_mangle]
pub extern "C" fn getOutputLength() -> usize;
```

### Input Schema (JSON)

```typescript
interface WasmParserInput {
  data: string;           // Raw contract data (JSON or hex)
  contractId: string;     // Stellar contract ID
  eventType?: string;     // Optional event type hint
}
```

### Output Schema (JSON)

```typescript
interface WasmParserOutput {
  description: string;    // Human-readable description
  fields?: Record<string, string>;  // Structured fields
  error?: string;         // Error message if any
}
```

## Security Mechanisms

### 1. Memory Safety

```typescript
const memory = new WebAssembly.Memory({
  initial: 1,           // 64KB initial
  maximum: 256,         // 16MB maximum (NO growth beyond)
});
```

**Protection:** Prevents memory exhaustion attacks

### 2. Timeout Protection

```typescript
const timeout = setTimeout(() => {
  worker.terminate();  // Forcibly kill worker
  reject(new WasmExecutionError("Timeout exceeded", "TIMEOUT_EXCEEDED"));
}, 5000);
```

**Protection:** Prevents infinite loops from hanging

### 3. Input Validation

```typescript
// Size limits
if (inputSize > MAX_INPUT_SIZE_BYTES) {
  throw new WasmExecutionError("Input too large", "INVALID_INPUT");
}

// Required fields
if (!input.data || !input.contractId) {
  throw new WasmExecutionError("Missing required fields", "INVALID_INPUT");
}
```

**Protection:** Prevents oversized payloads

### 4. Output Validation

```typescript
// Structure validation
if (!output.description || typeof output.description !== "string") {
  throw new WasmExecutionError("Invalid output structure", "INVALID_OUTPUT");
}

// Size limits
if (outputSize > MAX_OUTPUT_SIZE_BYTES) {
  throw new WasmExecutionError("Output too large", "INVALID_OUTPUT");
}
```

**Protection:** Ensures parsers return valid data

### 5. Import Object Restriction

```typescript
const imports = {
  env: {
    memory,  // ONLY memory - no other capabilities
    abort: () => { throw new Error("WASM abort"); }  // Minimal handler
  }
  // NO fs, NO net, NO process, NO console, NO timers
};
```

**Protection:** Zero attack surface for host access

## Error Types

| Error Type | Cause | Mitigation |
|------------|-------|------------|
| `LOAD_FAILED` | File not found, read error | Verify WASM file exists |
| `INSTANTIATION_FAILED` | Corrupted WASM, compilation error | Validate WASM binary |
| `INVALID_EXPORTS` | Missing alloc/dealloc/parse | Follow API contract |
| `MEMORY_LIMIT_EXCEEDED` | Exceeds 16MB | Optimize parser |
| `TIMEOUT_EXCEEDED` | Exceeds 5 seconds | Optimize algorithm |
| `RUNTIME_PANIC` | WASM trap, abort, or crash | Debug parser logic |
| `INVALID_INPUT` | Validation failure | Fix input format |
| `INVALID_OUTPUT` | Bad output structure | Fix output format |
| `ALLOCATION_FAILED` | Memory allocation failed | Reduce memory usage |
| `UNKNOWN_ERROR` | Unexpected error | Check logs |

## Performance Characteristics

### Execution Overhead

| Metric | Value | Notes |
|--------|-------|-------|
| Worker spawn | ~50-100ms | First execution only |
| Module compilation | ~10-50ms | Cached after first load |
| Memory allocation | <1ms | Linear memory is fast |
| String encoding/decoding | ~1-5ms | Depends on size |
| Total overhead | ~60-150ms | Acceptable for event parsing |

### Optimization Strategies

1. **Module Caching:** Compiled modules are cached in memory
2. **Worker Reuse:** Future enhancement could reuse workers
3. **Lazy Loading:** Modules loaded only when needed
4. **Parallel Execution:** Multiple parsers can run concurrently

### Benchmarks

```
Simple parse (100 bytes): ~80ms (first) / ~60ms (cached)
Complex parse (10KB): ~120ms (first) / ~90ms (cached)
Large parse (100KB): ~250ms (first) / ~200ms (cached)
```

## Integration with Translation System

### 1. Register WASM Parser

```typescript
import { registerWasmParser } from "./translator/wasm-registry";

registerWasmParser({
  contractId: "CDLZ...YSC",
  wasmPath: "./parsers/my-contract-parser.wasm",
  contractName: "My Custom Contract",
});
```

### 2. Automatic Fallback

```typescript
// Translation engine tries in order:
1. JavaScript blueprint (fast, trusted)
2. WASM parser (secure, community)
3. Raw hex fallback (no translation)
```

### 3. Runtime Selection

```typescript
const translator = new TranslationEngine();

// Automatically selects appropriate parser
const result = await translator.translate(rawEvent);
```

## Development Workflow

### For Parser Authors

```bash
# 1. Create Rust project
cargo new --lib my-parser
cd my-parser

# 2. Add dependencies (Cargo.toml)
[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# 3. Implement parser (src/lib.rs)
# Follow API contract: alloc, dealloc, parse, getOutputLength

# 4. Build WASM
cargo build --target wasm32-unknown-unknown --release

# 5. Test with sandbox
npm test -- wasm-sandbox-runner
```

### For Open-Audit Maintainers

```bash
# Build all examples
cd lib/wasm-sandbox/examples/rust
./build-all.sh  # or build-all.bat on Windows

# Run full test suite
npm test -- wasm-sandbox-runner

# Integration test
node scripts/test-wasm-sandbox.js
```

## Security Threat Model

### Threats Mitigated ✅

| Threat | Mitigation |
|--------|------------|
| Remote Code Execution | WASM sandbox with zero host access |
| Infinite loops / DoS | 5-second timeout + worker termination |
| Memory exhaustion | 16MB hard limit via WASM memory |
| Filesystem access | No fs imports provided |
| Network exfiltration | No net imports provided |
| Environment leaks | No env imports provided |
| Process escape | Worker thread isolation |
| Stack overflow | WASM stack limits + timeout |

### Threats NOT Mitigated ⚠️

| Threat | Reason | Mitigation |
|--------|--------|------------|
| Malicious output data | Parser controls output | Validate output structure |
| Side-channel attacks | Timing, speculation | Not in scope (no secrets) |
| Supply chain (Rust deps) | Community parsers | Code review before merge |

## Comparison with Alternatives

| Approach | Security | Performance | Complexity |
|----------|----------|-------------|------------|
| **WASM Sandbox** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| VM2 (deprecated) | ⭐⭐⚠️ | ⭐⭐⭐⭐ | ⭐⭐ |
| Isolated-vm | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Docker containers | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| Native JS (trusted) | ⭐ | ⭐⭐⭐⭐⭐ | ⭐ |

**Why WASM?**
- ✅ Industry-standard sandboxing
- ✅ Supported in Node.js natively
- ✅ Strong security guarantees
- ✅ Good performance
- ✅ Clear compilation target for community

## Testing Strategy

### 1. Unit Tests

- ✅ Valid parser execution
- ✅ Input validation
- ✅ Output validation
- ✅ Error handling
- ✅ Cache behavior

### 2. Security Tests

- ✅ Timeout on infinite loop
- ✅ Memory limit enforcement
- ✅ Resource isolation verification
- ✅ Crash isolation

### 3. Integration Tests

- ✅ End-to-end parsing
- ✅ Concurrent execution
- ✅ Performance benchmarks

### 4. Fuzz Testing

- ⏳ Planned: AFL++ on WASM binaries
- ⏳ Planned: libFuzzer integration

## Future Enhancements

### Short-term

- [ ] Worker pool for reduced spawn overhead
- [ ] Streaming parser support for large inputs
- [ ] Parser versioning and updates
- [ ] Community parser registry

### Long-term

- [ ] Gas metering for deterministic limits
- [ ] Formal verification of security properties
- [ ] Multi-language support (AssemblyScript, TinyGo)
- [ ] Browser-based parser playground

## References

- [WebAssembly Specification](https://webassembly.github.io/spec/)
- [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html)
- [Linear Memory in WASM](https://developer.mozilla.org/en-US/docs/WebAssembly/Understanding_the_text_format#linear_memory)
- [Rust WASM Book](https://rustwasm.github.io/docs/book/)
- [WebAssembly Security](https://webassembly.org/docs/security/)

## Support

For questions or issues:
- GitHub Issues: [Open-Audit/issues](https://github.com/yourusername/Open-Audit/issues)
- Discord: `#wasm-sandbox` channel
- Email: security@open-audit.io
