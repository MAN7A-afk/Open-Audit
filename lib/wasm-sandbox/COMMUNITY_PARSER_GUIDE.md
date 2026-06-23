# Community Parser Development Guide

Welcome! This guide helps you write custom contract parsers for Open-Audit using **WebAssembly** (WASM) for secure, isolated execution.

## Why WASM?

- **Security:** Your parser runs in a sandbox with NO access to filesystem, network, or environment
- **Safety:** Bugs or crashes in your parser can't affect Open-Audit
- **Performance:** Near-native speed with minimal overhead
- **Portability:** Write once in Rust/AssemblyScript, run anywhere

## Quick Start

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add WebAssembly target
rustup target add wasm32-unknown-unknown

# Clone Open-Audit
git clone https://github.com/yourusername/Open-Audit.git
cd Open-Audit
```

### Step 1: Create Your Parser

```bash
# Create new Rust library
cargo new --lib my-contract-parser
cd my-contract-parser
```

**Edit `Cargo.toml`:**

```toml
[package]
name = "my-contract-parser"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]  # Creates .wasm binary

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

[profile.release]
opt-level = "z"      # Optimize for size
lto = true           # Link-time optimization
codegen-units = 1
panic = "abort"
strip = true
```

### Step 2: Implement the Parser

**Edit `src/lib.rs`:**

```rust
use serde::{Deserialize, Serialize};
use std::alloc::{alloc, dealloc, Layout};
use std::slice;

// ============================================================================
// Input/Output Types (MUST match Open-Audit schema)
// ============================================================================

#[derive(Deserialize)]
struct ParserInput {
    data: String,
    #[serde(rename = "contractId")]
    contract_id: String,
    #[serde(rename = "eventType")]
    event_type: Option<String>,
}

#[derive(Serialize)]
struct ParserOutput {
    description: String,                      // REQUIRED
    fields: Option<serde_json::Value>,        // Optional
    error: Option<String>,                    // Optional
}

// ============================================================================
// Memory Management (REQUIRED EXPORTS)
// ============================================================================

#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let layout = Layout::from_size_align(size, 1).unwrap();
    unsafe { alloc(layout) }
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    let layout = Layout::from_size_align(size, 1).unwrap();
    unsafe { dealloc(ptr, layout) };
}

// ============================================================================
// Output Buffer (REQUIRED)
// ============================================================================

static mut OUTPUT_PTR: *mut u8 = std::ptr::null_mut();
static mut OUTPUT_LEN: usize = 0;

#[no_mangle]
pub extern "C" fn getOutputLength() -> usize {
    unsafe { OUTPUT_LEN }
}

// ============================================================================
// Parser Logic (REQUIRED EXPORT)
// ============================================================================

#[no_mangle]
pub extern "C" fn parse(input_ptr: *const u8, input_len: usize) -> *mut u8 {
    // 1. Read input from linear memory
    let input_slice = unsafe { slice::from_raw_parts(input_ptr, input_len) };
    let input_str = match std::str::from_utf8(input_slice) {
        Ok(s) => s,
        Err(_) => return error_output("Invalid UTF-8"),
    };

    // 2. Parse input JSON
    let input: ParserInput = match serde_json::from_str(input_str) {
        Ok(i) => i,
        Err(e) => return error_output(&format!("Failed to parse input: {}", e)),
    };

    // 3. YOUR CUSTOM LOGIC HERE
    let output = parse_my_contract(&input);

    // 4. Serialize output to JSON
    let output_str = serde_json::to_string(&output).unwrap();

    // 5. Allocate output in linear memory
    let output_bytes = output_str.as_bytes();
    let output_ptr = alloc(output_bytes.len());
    
    unsafe {
        std::ptr::copy_nonoverlapping(
            output_bytes.as_ptr(),
            output_ptr,
            output_bytes.len(),
        );
        OUTPUT_PTR = output_ptr;
        OUTPUT_LEN = output_bytes.len();
    }

    output_ptr
}

// ============================================================================
// Your Custom Parsing Logic
// ============================================================================

fn parse_my_contract(input: &ParserInput) -> ParserOutput {
    // Example: Parse a transfer event
    match serde_json::from_str::<serde_json::Value>(&input.data) {
        Ok(json) => {
            let from = json.get("from")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let to = json.get("to")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let amount = json.get("amount")
                .and_then(|v| v.as_str())
                .unwrap_or("0");

            let description = format!(
                "{} transferred {} tokens from {} to {}",
                shorten_address(&input.contract_id),
                amount,
                shorten_address(from),
                shorten_address(to)
            );

            let mut fields = serde_json::Map::new();
            fields.insert("from".to_string(), serde_json::json!(from));
            fields.insert("to".to_string(), serde_json::json!(to));
            fields.insert("amount".to_string(), serde_json::json!(amount));

            ParserOutput {
                description,
                fields: Some(serde_json::Value::Object(fields)),
                error: None,
            }
        }
        Err(e) => ParserOutput {
            description: format!("Failed to parse: {}", e),
            fields: None,
            error: Some(e.to_string()),
        }
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

fn error_output(message: &str) -> *mut u8 {
    let output = ParserOutput {
        description: format!("Parse error: {}", message),
        fields: None,
        error: Some(message.to_string()),
    };

    let output_str = serde_json::to_string(&output).unwrap();
    let output_bytes = output_str.as_bytes();
    let output_ptr = alloc(output_bytes.len());

    unsafe {
        std::ptr::copy_nonoverlapping(
            output_bytes.as_ptr(),
            output_ptr,
            output_bytes.len(),
        );
        OUTPUT_PTR = output_ptr;
        OUTPUT_LEN = output_bytes.len();
    }

    output_ptr
}

fn shorten_address(address: &str) -> String {
    if address.len() <= 12 {
        return address.to_string();
    }
    format!("{}...{}", &address[..6], &address[address.len() - 4..])
}
```

### Step 3: Build WASM Binary

```bash
cargo build --target wasm32-unknown-unknown --release

# Your WASM is at:
# target/wasm32-unknown-unknown/release/my_contract_parser.wasm
```

### Step 4: Test Your Parser

**Create `test-parser.js`:**

```javascript
const { WasmSandboxRunner } = require("./lib/wasm-sandbox/wasm-sandbox-runner");
const { join } = require("path");

async function testParser() {
  const runner = new WasmSandboxRunner();
  
  const result = await runner.execute(
    join(__dirname, "my-contract-parser/target/wasm32-unknown-unknown/release/my_contract_parser.wasm"),
    {
      data: JSON.stringify({
        from: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234",
        to: "GXYZ9876543210ZYXWVUTSRQPONMLKJIHGFEDCBA9876",
        amount: "1000000"
      }),
      contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      eventType: "transfer"
    }
  );

  if (result.success) {
    console.log("✅ Success!");
    console.log("Description:", result.output.description);
    console.log("Fields:", result.output.fields);
    console.log("Execution time:", result.stats.executionTimeMs, "ms");
  } else {
    console.error("❌ Error:", result.error.message);
  }
}

testParser();
```

```bash
node test-parser.js
```

### Step 5: Submit Your Parser

```bash
# 1. Copy WASM to Open-Audit
cp target/wasm32-unknown-unknown/release/my_contract_parser.wasm \
   /path/to/Open-Audit/parsers/

# 2. Register in Open-Audit
# Edit lib/translator/wasm-registry.ts

# 3. Submit Pull Request
git checkout -b feat/add-my-contract-parser
git add parsers/my_contract_parser.wasm
git add lib/translator/wasm-registry.ts
git commit -m "feat: Add parser for MyContract"
git push origin feat/add-my-contract-parser
```

## API Reference

### Required Exports

Your WASM module **MUST** export these functions:

```rust
// Allocate memory
pub extern "C" fn alloc(size: usize) -> *mut u8

// Deallocate memory  
pub extern "C" fn dealloc(ptr: *mut u8, size: usize)

// Parse input
pub extern "C" fn parse(input_ptr: *const u8, input_len: usize) -> *mut u8

// Get output length
pub extern "C" fn getOutputLength() -> usize
```

### Input Schema

```json
{
  "data": "string",           // Raw contract data (JSON or hex)
  "contractId": "string",     // Stellar contract ID (C...)
  "eventType": "string?"      // Optional event type
}
```

### Output Schema

```json
{
  "description": "string",    // REQUIRED: Human-readable description
  "fields": {                 // Optional: Structured data
    "key": "value"
  },
  "error": "string?"          // Optional: Error message
}
```

## Resource Limits

| Resource | Limit | Notes |
|----------|-------|-------|
| Memory | 16 MB | Hard limit, no growth |
| Execution Time | 5 seconds | Timeout triggers termination |
| Input Size | 1 MB | Validated before execution |
| Output Size | 1 MB | Validated after execution |

**Tip:** Optimize your parser to stay well under these limits.

## Common Patterns

### Parsing JSON Contract Data

```rust
fn parse_json_data(input: &ParserInput) -> ParserOutput {
    match serde_json::from_str::<serde_json::Value>(&input.data) {
        Ok(json) => {
            // Extract fields
            let field1 = json.get("field1").and_then(|v| v.as_str());
            let field2 = json.get("field2").and_then(|v| v.as_i64());
            
            // Build description
            let description = format!("Custom event: {} {}", field1.unwrap_or(""), field2.unwrap_or(0));
            
            ParserOutput { description, fields: None, error: None }
        }
        Err(e) => error_output(&format!("JSON parse error: {}", e))
    }
}
```

### Parsing Hex Contract Data

```rust
fn parse_hex_data(hex: &str) -> Vec<u8> {
    let clean = if hex.starts_with("0x") { &hex[2..] } else { hex };
    hex::decode(clean).unwrap_or_default()
}
```

### Formatting Addresses

```rust
fn format_address(addr: &str) -> String {
    if addr.len() <= 12 {
        addr.to_string()
    } else {
        format!("{}...{}", &addr[..6], &addr[addr.len() - 4..])
    }
}
```

### Formatting Amounts

```rust
fn format_amount(amount: &str, decimals: u32) -> String {
    let value: f64 = amount.parse().unwrap_or(0.0);
    let divisor = 10_f64.powi(decimals as i32);
    format!("{:.2}", value / divisor)
}
```

## Debugging Tips

### 1. Test Locally First

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parser() {
        let input = ParserInput {
            data: r#"{"from":"GABC...","to":"GXYZ...","amount":"1000000"}"#.to_string(),
            contract_id: "CDLZ...YSC".to_string(),
            event_type: Some("transfer".to_string()),
        };

        let output = parse_my_contract(&input);
        assert!(output.description.contains("transferred"));
    }
}
```

### 2. Use `panic!` for Debugging

```rust
// Panics will be caught by the sandbox and reported as errors
if some_invalid_condition {
    panic!("Debug info: value was {}", value);
}
```

### 3. Return Errors Instead of Panicking

```rust
// Better: Return error in output
if some_invalid_condition {
    return ParserOutput {
        description: "Invalid data".to_string(),
        fields: None,
        error: Some(format!("Expected X, got Y")),
    };
}
```

### 4. Check WASM Binary Size

```bash
ls -lh target/wasm32-unknown-unknown/release/*.wasm

# Should be < 100KB for most parsers
# If > 500KB, consider optimizations
```

### 5. Validate Exports

```bash
wasm-objdump -x target/wasm32-unknown-unknown/release/my_parser.wasm | grep "export"

# Should see:
#  - export alloc
#  - export dealloc
#  - export parse
#  - export getOutputLength
```

## Security Considerations

### What You CAN'T Do

- ❌ Access filesystem
- ❌ Make network requests
- ❌ Read environment variables
- ❌ Fork processes
- ❌ Access system clock (for security)
- ❌ Allocate > 16MB memory
- ❌ Run for > 5 seconds

### What You CAN Do

- ✅ Parse JSON/hex data
- ✅ Perform calculations
- ✅ Format strings
- ✅ Return structured data
- ✅ Use standard Rust libraries (no_std compatible)

### Best Practices

1. **Validate all inputs** before processing
2. **Handle errors gracefully** - return error in output, don't panic
3. **Optimize for performance** - stay under 1 second execution
4. **Keep binary small** - minimize dependencies
5. **Test edge cases** - empty data, malformed JSON, large inputs

## Examples

### Example 1: Token Transfer

```rust
// Parses: {"from":"G...","to":"G...","amount":"1000000"}
fn parse_transfer(input: &ParserInput) -> ParserOutput {
    let json: serde_json::Value = serde_json::from_str(&input.data)?;
    
    ParserOutput {
        description: format!(
            "Transfer {} from {} to {}",
            json["amount"], json["from"], json["to"]
        ),
        fields: Some(json),
        error: None,
    }
}
```

### Example 2: NFT Mint

```rust
// Parses: {"tokenId":"42","owner":"G...","metadata":"ipfs://..."}
fn parse_nft_mint(input: &ParserInput) -> ParserOutput {
    let json: serde_json::Value = serde_json::from_str(&input.data)?;
    
    ParserOutput {
        description: format!(
            "Minted NFT #{} to {}",
            json["tokenId"], shorten_address(json["owner"].as_str()?)
        ),
        fields: Some(json),
        error: None,
    }
}
```

### Example 3: DEX Swap

```rust
// Parses: {"tokenIn":"C...","tokenOut":"C...","amountIn":"1000","amountOut":"950"}
fn parse_swap(input: &ParserInput) -> ParserOutput {
    let json: serde_json::Value = serde_json::from_str(&input.data)?;
    
    ParserOutput {
        description: format!(
            "Swapped {} {} for {} {}",
            json["amountIn"], shorten_address(json["tokenIn"].as_str()?),
            json["amountOut"], shorten_address(json["tokenOut"].as_str()?)
        ),
        fields: Some(json),
        error: None,
    }
}
```

## FAQ

### Q: Can I use external crates?

**A:** Yes, but only `no_std` compatible crates. Avoid crates that require filesystem, network, or threads.

**Recommended:**
- `serde`, `serde_json` - JSON parsing
- `hex` - Hex encoding/decoding
- `base64` - Base64 encoding/decoding

**NOT compatible:**
- `reqwest`, `hyper` - Network
- `tokio`, `async-std` - Async runtime
- `std::fs` - Filesystem

### Q: How do I handle async operations?

**A:** You can't. WASM parsers are **synchronous only**. All parsing must complete in a single function call.

### Q: Can I call other WASM modules?

**A:** No. Each parser is isolated.

### Q: What if my contract schema changes?

**A:** Version your parsers:

```rust
// v1: Original schema
fn parse_v1(input: &ParserInput) -> ParserOutput { ... }

// v2: New schema
fn parse_v2(input: &ParserInput) -> ParserOutput { ... }

// Detect version from input
#[no_mangle]
pub extern "C" fn parse(input_ptr: *const u8, input_len: usize) -> *mut u8 {
    let input = read_input(input_ptr, input_len);
    
    if is_v2(&input) {
        parse_v2(&input)
    } else {
        parse_v1(&input)
    }
}
```

### Q: How do I get my parser added to Open-Audit?

**A:**
1. Build and test your parser
2. Submit PR with WASM file + tests
3. Maintainers review for security and correctness
4. Merge and deploy

## Support

- **GitHub Issues:** [Open-Audit/issues](https://github.com/yourusername/Open-Audit/issues)
- **Discord:** `#parser-development` channel
- **Examples:** `lib/wasm-sandbox/examples/rust/`

## Resources

- [Rust WASM Book](https://rustwasm.github.io/docs/book/)
- [WebAssembly Specification](https://webassembly.github.io/spec/)
- [Serde JSON Docs](https://docs.rs/serde_json/)
- [Open-Audit WASM Architecture](./WASM_SANDBOX_ARCHITECTURE.md)

---

**Happy parsing! 🚀**
