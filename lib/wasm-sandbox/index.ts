/**
 * WASM Sandbox - Secure Third-Party Parser Execution
 *
 * Provides isolated WebAssembly execution environment for community-developed
 * contract parsers with zero host capabilities and strict resource limits.
 *
 * @example
 * ```typescript
 * import { WasmSandboxRunner } from './lib/wasm-sandbox';
 *
 * const runner = new WasmSandboxRunner();
 *
 * const result = await runner.execute('./parser.wasm', {
 *   data: JSON.stringify({ from: 'G...', to: 'G...', amount: '1000000' }),
 *   contractId: 'CDLZ...YSC',
 *   eventType: 'transfer'
 * });
 *
 * if (result.success) {
 *   console.log(result.output.description);
 * }
 * ```
 *
 * @see {@link ./WASM_SANDBOX_ARCHITECTURE.md} for detailed architecture
 * @see {@link ./COMMUNITY_PARSER_GUIDE.md} for parser development guide
 */

export {
  WasmSandboxRunner,
  WasmExecutionError,
  MAX_EXECUTION_TIME_MS,
  MAX_MEMORY_PAGES,
  MAX_INPUT_SIZE_BYTES,
  MAX_OUTPUT_SIZE_BYTES,
  executeWasmDirect,
} from "./wasm-sandbox-runner";

export type {
  WasmParserInput,
  WasmParserOutput,
  WasmExecutionResult,
  WasmErrorType,
  ExecutionStats,
} from "./wasm-sandbox-runner";
