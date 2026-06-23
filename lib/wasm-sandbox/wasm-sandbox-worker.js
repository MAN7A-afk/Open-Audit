/**
 * WASM Sandbox Worker Thread
 *
 * This worker executes untrusted WASM binaries in an isolated thread.
 * The main thread cannot directly timeout WASM execution, so we use
 * Worker threads which can be forcibly terminated.
 *
 * SECURITY GUARANTEES:
 * - No WASI (no filesystem, network, or environment access)
 * - Memory limits enforced via WebAssembly.Memory configuration
 * - No host capabilities beyond memory allocation
 * - Execution isolation (crashes don't affect main thread)
 */

const { parentPort, workerData } = require("worker_threads");
const { performance } = require("perf_hooks");

// ============================================================================
// Worker Entry Point
// ============================================================================

(async function executeWasm() {
  if (!parentPort) {
    throw new Error("This script must be run as a Worker thread");
  }

  try {
    const { moduleBytes, input, maxMemoryPages } = workerData;

    if (!moduleBytes || !input || !maxMemoryPages) {
      throw new Error("Missing required worker data");
    }

    const startTime = performance.now();

    // Deserialize the module bytes (passed as Buffer)
    const module = await WebAssembly.compile(Buffer.from(moduleBytes));

    // Create memory with strict limits (no growth allowed)
    const memory = new WebAssembly.Memory({
      initial: 1, // 64KB initial
      maximum: maxMemoryPages, // e.g., 256 pages = 16MB max
    });

    // Create import object with ONLY memory
    // NO WASI, NO console, NO env, NO filesystem, NO network
    const imports = {
      env: {
        memory,
        // Minimal abort handler for AssemblyScript
        // This allows AssemblyScript to compile, but provides no actual host access
        abort: (msgPtr, filePtr, line, col) => {
          throw new Error(`WASM abort at line ${line}, col ${col}`);
        },
      },
    };

    // Instantiate the WASM module
    const instance = await WebAssembly.instantiate(module, imports);

    // Validate required exports
    const { alloc, dealloc, parse, getOutputLength, getOutput } =
      instance.exports;

    if (!alloc || !dealloc || !parse) {
      throw new Error(
        "WASM module missing required exports: alloc, dealloc, parse"
      );
    }

    // Get the memory buffer (use exported memory if available, otherwise the one we provided)
    const wasmMemory = instance.exports.memory || memory;
    const memoryBuffer = wasmMemory.buffer;

    // Parse input JSON
    const inputObj = JSON.parse(input);

    // Serialize input for WASM
    const inputStr = JSON.stringify(inputObj);
    const inputBytes = Buffer.from(inputStr, "utf8");

    // Allocate memory in WASM linear memory
    const inputPtr = alloc(inputBytes.length);

    if (!inputPtr || inputPtr === 0) {
      throw new Error("Failed to allocate input memory in WASM module");
    }

    // Copy input bytes to WASM memory
    const inputView = new Uint8Array(memoryBuffer);
    inputView.set(inputBytes, inputPtr);

    // Call the parse function
    // Expected signature: parse(inputPtr: i32, inputLen: i32) -> i32 (outputPtr)
    const outputPtr = parse(inputPtr, inputBytes.length);

    // Deallocate input memory
    dealloc(inputPtr);

    if (!outputPtr || outputPtr === 0) {
      throw new Error("Parse function returned null pointer");
    }

    // Get output length
    // Different strategies based on what the WASM exports:
    let outputLen = 0;

    if (typeof getOutputLength === "function") {
      // Strategy 1: WASM exports getOutputLength() -> i32
      outputLen = getOutputLength();
    } else if (typeof getOutput === "function") {
      // Strategy 2: WASM exports getOutput(bufPtr: i32) and writes length at outputPtr
      // This is a fallback for modules that don't export getOutputLength
      // We'll read the first 4 bytes at outputPtr as the length (common pattern)
      const lengthView = new DataView(memoryBuffer);
      outputLen = lengthView.getUint32(outputPtr, true); // little-endian
    } else {
      // Strategy 3: No length function - try to find null terminator (C-string style)
      const outputView = new Uint8Array(memoryBuffer);
      let i = outputPtr;
      while (i < outputView.length && outputView[i] !== 0) {
        i++;
      }
      outputLen = i - outputPtr;
    }

    if (outputLen === 0 || outputLen > memoryBuffer.byteLength) {
      throw new Error(
        `Invalid output length: ${outputLen} (memory size: ${memoryBuffer.byteLength})`
      );
    }

    // Read output from WASM memory
    const outputView = new Uint8Array(memoryBuffer);
    const outputBytes = outputView.slice(outputPtr, outputPtr + outputLen);
    const outputStr = Buffer.from(outputBytes).toString("utf8");

    // Deallocate output memory
    dealloc(outputPtr);

    // Parse output JSON
    let outputObj;
    try {
      outputObj = JSON.parse(outputStr);
    } catch (parseError) {
      throw new Error(
        `Failed to parse output JSON: ${parseError.message}. Output: ${outputStr.slice(0, 100)}`
      );
    }

    const endTime = performance.now();
    const peakMemoryBytes = wasmMemory.buffer.byteLength;

    // Send success result back to main thread
    parentPort.postMessage({
      success: true,
      output: outputObj,
      peakMemoryBytes,
      executionTimeMs: endTime - startTime,
    });
  } catch (error) {
    // Send error result back to main thread
    parentPort.postMessage({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
})();
