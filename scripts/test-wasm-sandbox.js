/**
 * Manual Test Script for WASM Sandbox
 *
 * This script allows you to manually test WASM parsers without running
 * the full test suite. Useful for development and debugging.
 *
 * Usage:
 *   node scripts/test-wasm-sandbox.js [wasm-file] [test-type]
 *
 * Examples:
 *   node scripts/test-wasm-sandbox.js valid         # Test valid parser
 *   node scripts/test-wasm-sandbox.js malicious     # Test malicious parser
 *   node scripts/test-wasm-sandbox.js ./my-parser.wasm custom  # Test custom parser
 */

const { WasmSandboxRunner } = require("../lib/wasm-sandbox/wasm-sandbox-runner");
const { join } = require("path");
const { existsSync } = require("fs");

// ============================================================================
// Test Data
// ============================================================================

const TEST_INPUTS = {
  transfer: {
    data: JSON.stringify({
      from: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234",
      to: "GXYZ9876543210ZYXWVUTSRQPONMLKJIHGFEDCBA9876",
      amount: "1000000",
    }),
    contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    eventType: "transfer",
  },
  
  swap: {
    data: JSON.stringify({
      tokenIn: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      tokenOut: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      amountIn: "1000000",
      amountOut: "950000",
    }),
    contractId: "CB3SJTX2IGWNQCNZHRMF6GQCQAAA2KZQXJQYBXQXQZBQXQZBQXQZBQXQZ",
    eventType: "swap",
  },
  
  empty: {
    data: "{}",
    contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  },
  
  hex: {
    data: "0x1234567890abcdef",
    contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  },
};

// ============================================================================
// Test Runner
// ============================================================================

async function testParser(wasmPath, input) {
  console.log("\n" + "=".repeat(80));
  console.log("Testing WASM Parser");
  console.log("=".repeat(80));
  console.log(`WASM File: ${wasmPath}`);
  console.log(`Input Contract ID: ${input.contractId}`);
  console.log(`Input Data: ${input.data.substring(0, 100)}${input.data.length > 100 ? "..." : ""}`);
  console.log("=".repeat(80) + "\n");

  const runner = new WasmSandboxRunner();
  
  console.log("⏳ Executing WASM parser...\n");
  
  const startTime = Date.now();
  const result = await runner.execute(wasmPath, input);
  const elapsed = Date.now() - startTime;

  console.log("=".repeat(80));
  console.log("Result");
  console.log("=".repeat(80));

  if (result.success) {
    console.log("✅ Status: SUCCESS");
    console.log("\n📄 Output:");
    console.log(JSON.stringify(result.output, null, 2));
    
    console.log("\n📊 Statistics:");
    console.log(`  - Execution Time: ${result.stats.executionTimeMs.toFixed(2)} ms`);
    console.log(`  - Peak Memory: ${(result.stats.peakMemoryBytes / 1024).toFixed(2)} KB`);
    console.log(`  - Timed Out: ${result.stats.timedOut ? "Yes" : "No"}`);
    console.log(`  - Total Elapsed: ${elapsed} ms`);
  } else {
    console.log("❌ Status: FAILURE");
    console.log("\n🚨 Error:");
    console.log(`  - Type: ${result.error.errorType}`);
    console.log(`  - Message: ${result.error.message}`);
    
    console.log("\n📊 Statistics:");
    console.log(`  - Execution Time: ${result.stats.executionTimeMs.toFixed(2)} ms`);
    console.log(`  - Timed Out: ${result.stats.timedOut ? "Yes" : "No"}`);
    console.log(`  - Total Elapsed: ${elapsed} ms`);
  }

  console.log("=".repeat(80) + "\n");
  
  return result;
}

// ============================================================================
// Test Scenarios
// ============================================================================

async function testValidParser() {
  const wasmPath = join(__dirname, "../lib/wasm-sandbox/compiled/valid_parser.wasm");
  
  if (!existsSync(wasmPath)) {
    console.error("❌ Error: valid_parser.wasm not found");
    console.error("   Run: cd lib/wasm-sandbox/examples/rust && ./build-all.sh");
    process.exit(1);
  }

  console.log("\n🧪 Test Suite: Valid Parser");
  console.log("Testing all input scenarios...\n");

  // Test 1: Transfer event
  console.log("Test 1/4: Transfer Event");
  await testParser(wasmPath, TEST_INPUTS.transfer);

  // Test 2: Swap event
  console.log("\nTest 2/4: Swap Event");
  await testParser(wasmPath, TEST_INPUTS.swap);

  // Test 3: Empty data
  console.log("\nTest 3/4: Empty Data");
  await testParser(wasmPath, TEST_INPUTS.empty);

  // Test 4: Hex data
  console.log("\nTest 4/4: Hex Data");
  await testParser(wasmPath, TEST_INPUTS.hex);

  console.log("\n✅ All valid parser tests completed!\n");
}

async function testMaliciousParser() {
  const wasmPath = join(__dirname, "../lib/wasm-sandbox/compiled/malicious_parser.wasm");
  
  if (!existsSync(wasmPath)) {
    console.error("❌ Error: malicious_parser.wasm not found");
    console.error("   Run: cd lib/wasm-sandbox/examples/rust && ./build-all.sh");
    process.exit(1);
  }

  console.log("\n🧪 Test Suite: Malicious Parser (Security Tests)");
  console.log("Testing security mechanisms...\n");

  console.log("Test: Infinite Loop (Should timeout after 5s)");
  const result = await testParser(wasmPath, TEST_INPUTS.transfer);

  if (!result.success && result.error.errorType === "TIMEOUT_EXCEEDED") {
    console.log("✅ Security mechanism working: Timeout protection activated\n");
  } else {
    console.log("⚠️  Warning: Expected timeout error\n");
  }
}

async function testCustomParser(customPath) {
  if (!existsSync(customPath)) {
    console.error(`❌ Error: WASM file not found: ${customPath}`);
    process.exit(1);
  }

  console.log("\n🧪 Test Suite: Custom Parser");
  console.log("Testing your custom parser...\n");

  await testParser(customPath, TEST_INPUTS.transfer);
}

// ============================================================================
// Performance Benchmark
// ============================================================================

async function benchmarkParser(wasmPath, iterations = 100) {
  console.log("\n" + "=".repeat(80));
  console.log("Performance Benchmark");
  console.log("=".repeat(80));
  console.log(`WASM File: ${wasmPath}`);
  console.log(`Iterations: ${iterations}`);
  console.log("=".repeat(80) + "\n");

  if (!existsSync(wasmPath)) {
    console.error("❌ Error: WASM file not found");
    process.exit(1);
  }

  const runner = new WasmSandboxRunner();
  const times = [];

  console.log("⏳ Running benchmark...\n");

  for (let i = 0; i < iterations; i++) {
    const result = await runner.execute(wasmPath, TEST_INPUTS.transfer);
    
    if (result.success) {
      times.push(result.stats.executionTimeMs);
    }

    if ((i + 1) % 10 === 0) {
      process.stdout.write(`  Completed: ${i + 1}/${iterations}\r`);
    }
  }

  console.log("\n");

  // Calculate statistics
  times.sort((a, b) => a - b);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const median = times[Math.floor(times.length / 2)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];

  console.log("=".repeat(80));
  console.log("Benchmark Results");
  console.log("=".repeat(80));
  console.log(`  Successful executions: ${times.length}/${iterations}`);
  console.log(`  Min: ${min.toFixed(2)} ms`);
  console.log(`  Max: ${max.toFixed(2)} ms`);
  console.log(`  Average: ${avg.toFixed(2)} ms`);
  console.log(`  Median: ${median.toFixed(2)} ms`);
  console.log(`  P95: ${p95.toFixed(2)} ms`);
  console.log(`  P99: ${p99.toFixed(2)} ms`);
  console.log("=".repeat(80) + "\n");
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const testType = args[0] || "valid";

  try {
    switch (testType) {
      case "valid":
        await testValidParser();
        break;

      case "malicious":
        await testMaliciousParser();
        break;

      case "custom":
        if (!args[1]) {
          console.error("❌ Error: Please provide WASM file path");
          console.error("   Usage: node scripts/test-wasm-sandbox.js custom <path-to-wasm>");
          process.exit(1);
        }
        await testCustomParser(args[1]);
        break;

      case "benchmark":
        const wasmPath = args[1] || join(__dirname, "../lib/wasm-sandbox/compiled/valid_parser.wasm");
        const iterations = parseInt(args[2]) || 100;
        await benchmarkParser(wasmPath, iterations);
        break;

      case "help":
      case "--help":
      case "-h":
        console.log(`
WASM Sandbox Test Script

Usage:
  node scripts/test-wasm-sandbox.js [command] [options]

Commands:
  valid                   Test valid parser with all scenarios (default)
  malicious               Test malicious parser (security tests)
  custom <wasm-file>      Test your custom WASM parser
  benchmark [wasm] [n]    Benchmark parser performance (default: 100 iterations)
  help                    Show this help message

Examples:
  node scripts/test-wasm-sandbox.js
  node scripts/test-wasm-sandbox.js valid
  node scripts/test-wasm-sandbox.js malicious
  node scripts/test-wasm-sandbox.js custom ./my-parser.wasm
  node scripts/test-wasm-sandbox.js benchmark
  node scripts/test-wasm-sandbox.js benchmark ./my-parser.wasm 200
`);
        break;

      default:
        // Try to interpret as custom WASM file path
        if (existsSync(testType)) {
          await testCustomParser(testType);
        } else {
          console.error(`❌ Error: Unknown test type or file not found: ${testType}`);
          console.error("   Run: node scripts/test-wasm-sandbox.js help");
          process.exit(1);
        }
    }
  } catch (error) {
    console.error("\n❌ Unhandled Error:");
    console.error(error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { testParser, benchmarkParser };
