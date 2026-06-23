# WASM Sandbox - Quick Reference

## 🚀 One-Minute Quick Start

```typescript
import { WasmSandboxRunner } from './lib/wasm-sandbox';

const runner = new WasmSandboxRunner();
const result = await runner.execute('./parser.wasm', {
  data: JSON.stringify({ from: 'G...', to: 'G...', amount: '1000000' }),
  contractId: 'CDLZ...YSC'
});

console.log(result.success ? result.output : result.error);
```

## 📋 Common Commands

```bash
# Build WASM examples
cd lib/wasm-sandbox/examples/rust && ./build-all.sh

# Run tests
npm run test:wasm                # All tests
npm run test:wasm:watch          # Watch mode
npm run test:wasm:manual         # Manual test (valid)
npm run test:wasm:manual malicious  # Security tests
npm run test:wasm:benchmark      # Performance

# Custom parser
npm run test:wasm:manual custom ./my-parser.wasm
```

## 🔒 Security Limits

| Resource | Limit |
|----------|-------|
| Memory | 16 MB |
| Execution Time | 5 seconds |
| Input Size | 1 MB |
| Output Size | 1 MB |

## 📝 Required WASM Exports

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

## 📦 Input Schema

```json
{
  "data": "string",           // Required: Contract data
  "contractId": "string",     // Required: Stellar contract ID
  "eventType": "string?"      // Optional: Event type hint
}
```

## 📤 Output Schema

```json
{
  "description": "string",    // Required: Human-readable description
  "fields": {},               // Optional: Structured data
  "error": "string?"          // Optional: Error message
}
```

## ⚠️ Error Types

| Type | Cause |
|------|-------|
| `LOAD_FAILED` | File not found |
| `INSTANTIATION_FAILED` | WASM compilation error |
| `INVALID_EXPORTS` | Missing required exports |
| `TIMEOUT_EXCEEDED` | Execution > 5s |
| `RUNTIME_PANIC` | WASM trap/crash |
| `INVALID_INPUT` | Bad input |
| `INVALID_OUTPUT` | Bad output |

## 🏗️ Minimal Parser Template

```rust
use serde::{Deserialize, Serialize};
use std::alloc::{alloc, dealloc, Layout};

#[derive(Deserialize)]
struct ParserInput {
    data: String,
    #[serde(rename = "contractId")]
    contract_id: String,
}

#[derive(Serialize)]
struct ParserOutput {
    description: String,
}

#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    unsafe { alloc(Layout::from_size_align(size, 1).unwrap()) }
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    unsafe { dealloc(ptr, Layout::from_size_align(size, 1).unwrap()) }
}

static mut OUTPUT_PTR: *mut u8 = std::ptr::null_mut();
static mut OUTPUT_LEN: usize = 0;

#[no_mangle]
pub extern "C" fn getOutputLength() -> usize {
    unsafe { OUTPUT_LEN }
}

#[no_mangle]
pub extern "C" fn parse(input_ptr: *const u8, input_len: usize) -> *mut u8 {
    // 1. Read input
    let input_slice = unsafe { std::slice::from_raw_parts(input_ptr, input_len) };
    let input: ParserInput = serde_json::from_slice(input_slice).unwrap();
    
    // 2. Process
    let output = ParserOutput {
        description: format!("Parsed: {}", input.data)
    };
    
    // 3. Write output
    let output_str = serde_json::to_string(&output).unwrap();
    let output_bytes = output_str.as_bytes();
    let output_ptr = alloc(output_bytes.len());
    
    unsafe {
        std::ptr::copy_nonoverlapping(
            output_bytes.as_ptr(),
            output_ptr,
            output_bytes.len()
        );
        OUTPUT_PTR = output_ptr;
        OUTPUT_LEN = output_bytes.len();
    }
    
    output_ptr
}
```

## 🔗 Documentation Links

- **[Architecture](./WASM_SANDBOX_ARCHITECTURE.md)** - Technical deep dive
- **[Community Guide](./COMMUNITY_PARSER_GUIDE.md)** - Write your parser
- **[Main README](./README.md)** - Overview and setup
- **[Task Summary](../../TASK_5_WASM_SANDBOX_SUMMARY.md)** - Implementation details

## 💡 Tips

1. **Start with examples**: Copy `valid-parser` and modify
2. **Test locally first**: Use `npm run test:wasm:manual custom`
3. **Keep it simple**: Avoid complex dependencies
4. **Handle errors**: Return error in output, don't panic
5. **Optimize binary**: Use release profile (opt-level = "z")

## 🐛 Troubleshooting

**WASM file not found?**
```bash
cd lib/wasm-sandbox/examples/rust && ./build-all.sh
```

**Timeout exceeded?**
- Optimize your algorithm
- Reduce processing time
- Check for infinite loops

**Invalid exports?**
- Must export: `alloc`, `dealloc`, `parse`, `getOutputLength`
- Check with: `wasm-objdump -x file.wasm | grep export`

**Invalid output?**
- Must return JSON with `description` field
- Check output size < 1MB

## 📊 Performance Expectations

```
Simple parse:   ~80ms
Complex parse:  ~120ms
Large parse:    ~250ms
```

## 🎯 Support

- **Issues**: [GitHub Issues](https://github.com/your-org/Open-Audit/issues)
- **Discord**: `#wasm-sandbox` channel
- **Email**: support@open-audit.io
