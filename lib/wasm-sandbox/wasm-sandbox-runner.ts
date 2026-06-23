/**
 * Secure WebAssembly Sandbox Runner
 *
 * Provides isolated execution environment for third-party parser logic
 * compiled to WebAssembly. Enforces strict security constraints:
 *
 * - Zero host capabilities (no network, filesystem, env access)
 * - Memory limits (maximum 16MB per instance)
 * - Execution timeouts (maximum 5 seconds per execution)
 * - Resource cleanup and isolation
 *
 * This enables community developers to write custom contract parsers
 * without introducing RCE vulnerabilities.
 */

import { Worker } from "worker_threads";
import { join } from "path";
import { readFile } from "fs/promises";

// ============================================================================
// Configuration Constants
// ============================================================================

/**
 * Maximum memory pages (1 page = 64KB).
 * 256 pages = 16MB total memory limit.
 */
export const MAX_MEMORY_PAGES = 256;

/**
 * Maximum execution time in milliseconds.
 * Prevents infinite loops from hanging the system.
 */
export const MAX_EXECUTION_TIME_MS = 5000;

/**
 * Maximum input size in bytes (1 MB).
 * Prevents memory exhaustion attacks via large inputs.
 */
export const MAX_INPUT_SIZE_BYTES = 1024 * 1024;

/**
 * Maximum output size in bytes (1 MB).
 * Prevents memory exhaustion attacks via large outputs.
 */
export const MAX_OUTPUT_SIZE_BYTES = 1024 * 1024;

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Input passed to the WASM parser.
 */
export interface WasmParserInput {
  /** Raw contract data as JSON string or base64-encoded bytes */
  data: string;
  /** Contract ID for context */
  contractId: string;
  /** Event type for context */
  eventType?: string;
}

/**
 * Expected output from the WASM parser.
 */
export interface WasmParserOutput {
  /** Parsed human-readable description */
  description: string;
  /** Extracted fields as key-value pairs */
  fields?: Record<string, string>;
  /** Error message if parsing partially failed */
  error?: string;
}

/**
 * Result of WASM execution.
 */
export type WasmExecutionResult =
  | { success: true; output: WasmParserOutput; error: null; stats: ExecutionStats }
  | { success: false; output: null; error: WasmExecutionError; stats: ExecutionStats };

/**
 * Execution statistics for monitoring.
 */
export interface ExecutionStats {
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Peak memory usage in bytes */
  peakMemoryBytes: number;
  /** Whether execution was terminated due to timeout */
  timedOut: boolean;
}

/**
 * Custom error class for WASM execution failures.
 */
export class WasmExecutionError extends Error {
  constructor(
    message: string,
    public readonly errorType: WasmErrorType,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "WasmExecutionError";
  }
}

/**
 * Types of WASM execution errors.
 */
export type WasmErrorType =
  | "LOAD_FAILED"           // Failed to load .wasm file
  | "INSTANTIATION_FAILED"  // Failed to instantiate WASM module
  | "INVALID_EXPORTS"       // WASM module missing required exports
  | "MEMORY_LIMIT_EXCEEDED" // Exceeded memory limits
  | "TIMEOUT_EXCEEDED"      // Execution took too long
  | "RUNTIME_PANIC"         // WASM module panicked/trapped
  | "INVALID_INPUT"         // Input validation failed
  | "INVALID_OUTPUT"        // Output validation failed
  | "ALLOCATION_FAILED"     // Memory allocation failed
  | "UNKNOWN_ERROR";        // Unexpected error

// ============================================================================
// WASM Sandbox Runner
// ============================================================================

/**
 * Secure WebAssembly sandbox runner.
 *
 * Usage:
 * ```typescript
 * const runner = new WasmSandboxRunner();
 * const result = await runner.execute("/path/to/parser.wasm", {
 *   data: JSON.stringify(contractData),
 *   contractId: "CABC...1234",
 * });
 *
 * if (result.success) {
 *   console.log("Parsed:", result.output.description);
 * } else {
 *   console.error("Error:", result.error.message);
 * }
 * ```
 */
export class WasmSandboxRunner {
  private instanceCache: Map<string, WebAssembly.Module> = new Map();

  /**
   * Executes a WASM parser in an isolated sandbox.
   *
   * @param wasmPath Path to the .wasm file
   * @param input Input data to parse
   * @returns Execution result with output or error
   */
  async execute(
    wasmPath: string,
    input: WasmParserInput
  ): Promise<WasmExecutionResult> {
    const startTime = Date.now();
    let peakMemoryBytes = 0;
    let timedOut = false;

    try {
      // Validate input
      this.validateInput(input);

      // Load and compile WASM module
      const module = await this.loadModule(wasmPath);

      // Execute in isolated environment with timeout
      const result = await this.executeWithTimeout(
        module,
        input,
        MAX_EXECUTION_TIME_MS
      );

      peakMemoryBytes = result.peakMemoryBytes;
      timedOut = result.timedOut;

      if (timedOut) {
        throw new WasmExecutionError(
          `Execution exceeded timeout of ${MAX_EXECUTION_TIME_MS}ms`,
          "TIMEOUT_EXCEEDED"
        );
      }

      // Validate output
      this.validateOutput(result.output);

      const executionTimeMs = Date.now() - startTime;

      return {
        success: true,
        output: result.output,
        error: null,
        stats: {
          executionTimeMs,
          peakMemoryBytes,
          timedOut: false,
        },
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      // Convert to WasmExecutionError
      const wasmError = error instanceof WasmExecutionError
        ? error
        : new WasmExecutionError(
            error instanceof Error ? error.message : String(error),
            "UNKNOWN_ERROR",
            error
          );

      return {
        success: false,
        output: null,
        error: wasmError,
        stats: {
          executionTimeMs,
          peakMemoryBytes,
          timedOut,
        },
      };
    }
  }

  /**
   * Loads and compiles a WASM module from disk.
   * Uses caching to avoid recompiling the same module.
   */
  private async loadModule(wasmPath: string): Promise<WebAssembly.Module> {
    // Check cache
    const cached = this.instanceCache.get(wasmPath);
    if (cached) {
      return cached;
    }

    try {
      // Read WASM binary
      const wasmBytes = await readFile(wasmPath);

      // Compile module
      const module = await WebAssembly.compile(wasmBytes);

      // Cache for reuse
      this.instanceCache.set(wasmPath, module);

      return module;
    } catch (error) {
      throw new WasmExecutionError(
        `Failed to load WASM module from ${wasmPath}: ${error instanceof Error ? error.message : String(error)}`,
        "LOAD_FAILED",
        error
      );
    }
  }

  /**
   * Executes WASM module with timeout protection using Worker threads.
   */
  private async executeWithTimeout(
    module: WebAssembly.Module,
    input: WasmParserInput,
    timeoutMs: number
  ): Promise<{ output: WasmParserOutput; peakMemoryBytes: number; timedOut: boolean }> {
    return new Promise((resolve, reject) => {
      // Create isolated worker thread
      const workerPath = join(__dirname, "wasm-sandbox-worker.js");
      const worker = new Worker(workerPath, {
        workerData: {
          moduleBytes: module,
          input: JSON.stringify(input),
          maxMemoryPages: MAX_MEMORY_PAGES,
        },
      });

      let timedOut = false;
      let completed = false;

      // Set timeout
      const timeout = setTimeout(() => {
        if (!completed) {
          timedOut = true;
          worker.terminate();
          reject(
            new WasmExecutionError(
              `Execution exceeded timeout of ${timeoutMs}ms`,
              "TIMEOUT_EXCEEDED"
            )
          );
        }
      }, timeoutMs);

      // Handle worker messages
      worker.on("message", (message: { success: boolean; output?: WasmParserOutput; error?: string; peakMemoryBytes?: number }) => {
        completed = true;
        clearTimeout(timeout);
        worker.terminate();

        if (message.success && message.output) {
          resolve({
            output: message.output,
            peakMemoryBytes: message.peakMemoryBytes ?? 0,
            timedOut: false,
          });
        } else {
          reject(
            new WasmExecutionError(
              message.error ?? "Unknown worker error",
              "RUNTIME_PANIC"
            )
          );
        }
      });

      // Handle worker errors
      worker.on("error", (error) => {
        completed = true;
        clearTimeout(timeout);
        worker.terminate();
        reject(
          new WasmExecutionError(
            `Worker error: ${error.message}`,
            "RUNTIME_PANIC",
            error
          )
        );
      });

      // Handle worker exit
      worker.on("exit", (code) => {
        if (!completed) {
          completed = true;
          clearTimeout(timeout);
          if (code !== 0) {
            reject(
              new WasmExecutionError(
                `Worker exited with code ${code}`,
                "RUNTIME_PANIC"
              )
            );
          }
        }
      });
    });
  }

  /**
   * Validates input data.
   */
  private validateInput(input: WasmParserInput): void {
    if (!input.data) {
      throw new WasmExecutionError(
        "Input data is required",
        "INVALID_INPUT"
      );
    }

    if (typeof input.data !== "string") {
      throw new WasmExecutionError(
        "Input data must be a string",
        "INVALID_INPUT"
      );
    }

    const inputSize = Buffer.byteLength(input.data, "utf8");
    if (inputSize > MAX_INPUT_SIZE_BYTES) {
      throw new WasmExecutionError(
        `Input size (${inputSize} bytes) exceeds maximum (${MAX_INPUT_SIZE_BYTES} bytes)`,
        "INVALID_INPUT"
      );
    }

    if (!input.contractId) {
      throw new WasmExecutionError(
        "Contract ID is required",
        "INVALID_INPUT"
      );
    }
  }

  /**
   * Validates output data.
   */
  private validateOutput(output: WasmParserOutput): void {
    if (!output || typeof output !== "object") {
      throw new WasmExecutionError(
        "Output must be an object",
        "INVALID_OUTPUT"
      );
    }

    if (!output.description || typeof output.description !== "string") {
      throw new WasmExecutionError(
        "Output must contain a 'description' string field",
        "INVALID_OUTPUT"
      );
    }

    // Check output size
    const outputSize = Buffer.byteLength(JSON.stringify(output), "utf8");
    if (outputSize > MAX_OUTPUT_SIZE_BYTES) {
      throw new WasmExecutionError(
        `Output size (${outputSize} bytes) exceeds maximum (${MAX_OUTPUT_SIZE_BYTES} bytes)`,
        "INVALID_OUTPUT"
      );
    }
  }

  /**
   * Clears the module cache.
   * Useful for testing or when modules are updated.
   */
  clearCache(): void {
    this.instanceCache.clear();
  }
}

// ============================================================================
// Direct Execution (Without Worker Threads - For Simple Cases)
// ============================================================================

/**
 * Executes WASM module directly in the current thread.
 * WARNING: This does not provide timeout protection!
 * Only use for trusted WASM modules.
 *
 * @internal
 */
export async function executeWasmDirect(
  module: WebAssembly.Module,
  input: WasmParserInput
): Promise<WasmParserOutput> {
  // Create memory with strict limits
  const memory = new WebAssembly.Memory({
    initial: 1,                    // 64KB initial
    maximum: MAX_MEMORY_PAGES,     // 16MB maximum
  });

  // Import object with ONLY memory (no host capabilities)
  const imports = {
    env: {
      memory,
      // Abort function for AssemblyScript
      abort: (msg: number, file: number, line: number, col: number) => {
        throw new Error(`WASM abort: line ${line}, col ${col}`);
      },
    },
  };

  // Instantiate module
  const instance = await WebAssembly.instantiate(module, imports);

  // Verify required exports
  const exports = instance.exports as {
    memory?: WebAssembly.Memory;
    alloc?: (size: number) => number;
    dealloc?: (ptr: number) => void;
    parse?: (inputPtr: number, inputLen: number) => number;
    getOutputLength?: () => number;
    getOutput?: (outputPtr: number) => void;
  };

  if (!exports.alloc || !exports.dealloc || !exports.parse) {
    throw new WasmExecutionError(
      "WASM module missing required exports: alloc, dealloc, parse",
      "INVALID_EXPORTS"
    );
  }

  // Get memory buffer
  const memoryBuffer = (exports.memory ?? memory).buffer;

  // Allocate input string in WASM memory
  const inputStr = JSON.stringify(input);
  const inputBytes = Buffer.from(inputStr, "utf8");
  const inputPtr = exports.alloc(inputBytes.length);

  if (!inputPtr) {
    throw new WasmExecutionError(
      "Failed to allocate memory in WASM module",
      "ALLOCATION_FAILED"
    );
  }

  // Copy input to WASM memory
  const inputView = new Uint8Array(memoryBuffer);
  inputView.set(inputBytes, inputPtr);

  // Call parse function
  const outputPtr = exports.parse(inputPtr, inputBytes.length);

  // Deallocate input
  exports.dealloc(inputPtr);

  if (!outputPtr) {
    throw new WasmExecutionError(
      "Parse function returned null pointer",
      "RUNTIME_PANIC"
    );
  }

  // Get output length
  const outputLen = exports.getOutputLength?.() ?? 0;

  if (!outputLen) {
    throw new WasmExecutionError(
      "Parse function returned zero-length output",
      "RUNTIME_PANIC"
    );
  }

  // Read output from WASM memory
  const outputView = new Uint8Array(memoryBuffer);
  const outputBytes = outputView.slice(outputPtr, outputPtr + outputLen);
  const outputStr = Buffer.from(outputBytes).toString("utf8");

  // Deallocate output
  exports.dealloc(outputPtr);

  // Parse output JSON
  try {
    return JSON.parse(outputStr) as WasmParserOutput;
  } catch (error) {
    throw new WasmExecutionError(
      `Failed to parse output JSON: ${error instanceof Error ? error.message : String(error)}`,
      "INVALID_OUTPUT",
      error
    );
  }
}
