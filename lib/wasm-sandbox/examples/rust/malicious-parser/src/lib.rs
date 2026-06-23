/**
 * Malicious WASM Parser Examples
 *
 * This module contains intentionally malicious WASM parsers for testing
 * the sandbox's security mechanisms:
 *
 * 1. Infinite loop (tests timeout protection)
 * 2. Memory bomb (tests memory limits)
 * 3. Stack overflow (tests recursion limits)
 *
 * These are used ONLY for security testing and should NEVER be deployed.
 */

use std::alloc::{alloc, dealloc, Layout};
use std::slice;

// ============================================================================
// Memory Management
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

static mut OUTPUT_PTR: *mut u8 = std::ptr::null_mut();
static mut OUTPUT_LEN: usize = 0;

#[no_mangle]
pub extern "C" fn getOutputLength() -> usize {
    unsafe { OUTPUT_LEN }
}

// ============================================================================
// Malicious Parser Variants
// ============================================================================

/// ATTACK 1: Infinite Loop
/// This parser enters an infinite loop to test timeout protection.
#[no_mangle]
pub extern "C" fn parse_infinite_loop(_input_ptr: *const u8, _input_len: usize) -> *mut u8 {
    // Infinite loop - should be terminated by timeout
    loop {
        // Prevent compiler from optimizing away the loop
        unsafe {
            std::ptr::write_volatile(&mut OUTPUT_LEN, OUTPUT_LEN.wrapping_add(1));
        }
    }
}

/// ATTACK 2: Memory Bomb
/// This parser attempts to allocate massive amounts of memory.
#[no_mangle]
pub extern "C" fn parse_memory_bomb(_input_ptr: *const u8, _input_len: usize) -> *mut u8 {
    // Try to allocate 1GB of memory (should fail due to 16MB limit)
    let huge_size = 1024 * 1024 * 1024; // 1GB
    
    match Layout::from_size_align(huge_size, 1) {
        Ok(layout) => {
            let ptr = unsafe { alloc(layout) };
            
            // Try to write to the allocated memory
            unsafe {
                for i in 0..huge_size {
                    std::ptr::write_volatile(ptr.add(i), 0xFF);
                }
            }
            
            ptr
        }
        Err(_) => std::ptr::null_mut(),
    }
}

/// ATTACK 3: Stack Overflow (Deep Recursion)
/// This parser recurses deeply to overflow the stack.
#[no_mangle]
pub extern "C" fn parse_stack_overflow(_input_ptr: *const u8, _input_len: usize) -> *mut u8 {
    fn recurse(depth: u32) -> u32 {
        if depth > 0 {
            // Prevent tail call optimization
            let result = recurse(depth - 1);
            result + 1
        } else {
            0
        }
    }

    // Recurse 1 million times (should overflow stack)
    let _ = recurse(1_000_000);
    
    std::ptr::null_mut()
}

/// ATTACK 4: Integer Overflow in Allocation
/// Attempts to trigger integer overflow in size calculation.
#[no_mangle]
pub extern "C" fn parse_integer_overflow(_input_ptr: *const u8, _input_len: usize) -> *mut u8 {
    // Try to allocate using overflowed size
    let size = usize::MAX;
    
    match Layout::from_size_align(size, 1) {
        Ok(layout) => unsafe { alloc(layout) },
        Err(_) => std::ptr::null_mut(),
    }
}

/// ATTACK 5: Out of Bounds Memory Access
/// Attempts to read/write outside allocated memory.
#[no_mangle]
pub extern "C" fn parse_oob_access(input_ptr: *const u8, input_len: usize) -> *mut u8 {
    // Try to read way beyond the input buffer
    let oob_offset = input_len + 1000000;
    
    unsafe {
        // This should trap or return garbage
        let _ = std::ptr::read_volatile(input_ptr.add(oob_offset));
    }
    
    std::ptr::null_mut()
}

/// ATTACK 6: Null Pointer Dereference
/// Attempts to dereference a null pointer.
#[no_mangle]
pub extern "C" fn parse_null_deref(_input_ptr: *const u8, _input_len: usize) -> *mut u8 {
    unsafe {
        let null_ptr: *const u32 = std::ptr::null();
        // This should trap
        let _ = std::ptr::read_volatile(null_ptr);
    }
    
    std::ptr::null_mut()
}

/// Default parse function (delegates to one of the attack variants)
/// In practice, you'd build different .wasm files for each attack.
#[no_mangle]
pub extern "C" fn parse(input_ptr: *const u8, input_len: usize) -> *mut u8 {
    // Default to infinite loop attack
    parse_infinite_loop(input_ptr, input_len)
}
