/**
 * Valid WASM Parser Example
 *
 * This is a reference implementation of a secure WASM parser that:
 * - Implements the required host-guest API contract
 * - Exports alloc, dealloc, parse functions
 * - Uses linear memory for string passing
 * - Parses contract data and returns structured output
 * - Has no external dependencies or host capabilities
 */

use serde::{Deserialize, Serialize};
use std::alloc::{alloc, dealloc, Layout};
use std::slice;

// ============================================================================
// Type Definitions
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
    description: String,
    fields: Option<serde_json::Value>,
    error: Option<String>,
}

// ============================================================================
// Memory Management (Linear Memory Allocation Pattern)
// ============================================================================

/// Allocates memory in linear memory and returns a pointer.
/// The host calls this to allocate space for input strings.
#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let layout = Layout::from_size_align(size, 1).unwrap();
    unsafe { alloc(layout) }
}

/// Deallocates memory at the given pointer.
/// The host calls this to free memory after reading output.
#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    let layout = Layout::from_size_align(size, 1).unwrap();
    unsafe { dealloc(ptr, layout) };
}

// ============================================================================
// Output Buffer Management
// ============================================================================

static mut OUTPUT_PTR: *mut u8 = std::ptr::null_mut();
static mut OUTPUT_LEN: usize = 0;

/// Returns the length of the last output string.
#[no_mangle]
pub extern "C" fn getOutputLength() -> usize {
    unsafe { OUTPUT_LEN }
}

// ============================================================================
// Parser Logic
// ============================================================================

/// Main parsing function called by the host.
///
/// Takes a pointer to the input JSON string and its length,
/// parses it, and returns a pointer to the output JSON string.
///
/// The host is responsible for:
/// 1. Allocating input memory via alloc()
/// 2. Reading output via getOutputLength() and memory access
/// 3. Deallocating both input and output via dealloc()
#[no_mangle]
pub extern "C" fn parse(input_ptr: *const u8, input_len: usize) -> *mut u8 {
    // Read input from linear memory
    let input_slice = unsafe { slice::from_raw_parts(input_ptr, input_len) };
    let input_str = match std::str::from_utf8(input_slice) {
        Ok(s) => s,
        Err(_) => return error_output("Invalid UTF-8 input"),
    };

    // Parse input JSON
    let input: ParserInput = match serde_json::from_str(input_str) {
        Ok(i) => i,
        Err(e) => return error_output(&format!("Failed to parse input: {}", e)),
    };

    // Parse the contract data
    let output = parse_contract_data(&input);

    // Serialize output to JSON
    let output_str = match serde_json::to_string(&output) {
        Ok(s) => s,
        Err(e) => return error_output(&format!("Failed to serialize output: {}", e)),
    };

    // Allocate output in linear memory
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

/// Parses contract data and returns structured output.
fn parse_contract_data(input: &ParserInput) -> ParserOutput {
    // Try to parse the data as JSON
    match serde_json::from_str::<serde_json::Value>(&input.data) {
        Ok(json_value) => {
            // Extract meaningful fields from the JSON
            let description = format!(
                "Parsed event from contract {} ({})",
                shorten_address(&input.contract_id),
                input.event_type.as_deref().unwrap_or("unknown")
            );

            let mut fields = serde_json::Map::new();
            fields.insert("contractId".to_string(), serde_json::json!(input.contract_id));
            
            if let Some(event_type) = &input.event_type {
                fields.insert("eventType".to_string(), serde_json::json!(event_type));
            }

            // Add parsed data fields
            if let Some(obj) = json_value.as_object() {
                for (key, value) in obj {
                    fields.insert(key.clone(), value.clone());
                }
            }

            ParserOutput {
                description,
                fields: Some(serde_json::Value::Object(fields)),
                error: None,
            }
        }
        Err(_) => {
            // Not JSON - treat as raw hex or string
            let description = format!(
                "Raw data from contract {}: {}",
                shorten_address(&input.contract_id),
                truncate_string(&input.data, 50)
            );

            let mut fields = serde_json::Map::new();
            fields.insert("contractId".to_string(), serde_json::json!(input.contract_id));
            fields.insert("rawData".to_string(), serde_json::json!(truncate_string(&input.data, 200)));

            ParserOutput {
                description,
                fields: Some(serde_json::Value::Object(fields)),
                error: None,
            }
        }
    }
}

/// Creates an error output message.
fn error_output(message: &str) -> *mut u8 {
    let output = ParserOutput {
        description: format!("Parse error: {}", message),
        fields: None,
        error: Some(message.to_string()),
    };

    let output_str = serde_json::to_string(&output).unwrap_or_else(|_| {
        r#"{"description":"Fatal error","fields":null,"error":"Serialization failed"}"#.to_string()
    });

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
// Helper Functions
// ============================================================================

/// Shortens a Stellar address to "GABC...XYZ" format.
fn shorten_address(address: &str) -> String {
    if address.len() <= 12 {
        return address.to_string();
    }
    format!("{}...{}", &address[..6], &address[address.len() - 4..])
}

/// Truncates a string to the specified length.
fn truncate_string(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len])
    }
}
