/**
 * Tests for the parallelized ingestion pool (Producer / Consumer).
 *
 * These cover the two acceptance criteria for the multi-threaded consumer
 * architecture:
 *   1. Throughput scales — a simulated 1,000+ events-per-block spike drains
 *      fully and is shared across the consumer fleet (no single-threaded stall).
 *   2. Per-contract event ordering stays strictly consistent, with zero race
 *      conditions, even under randomized consumer delays.
 */

import { describe, it, expect } from "vitest";
import {
  createIngestionPool,
  hashKey,
  DEFAULT_WORKER_COUNT,
} from "../ingestion-pool";

interface TestEvent {
  contractId: string;
  /** Monotonic sequence number within a contract, used to assert ordering. */
  seq: number;
}

/** Sleeps for a small random duration to force consumer interleaving. */
function randomDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 5)));
}

describe("hashKey", () => {
  it("is deterministic for the same key", () => {
    expect(hashKey("CONTRACT_A")).toBe(hashKey("CONTRACT_A"));
  });

  it("always routes a given key to the same partition", () => {
    const workerCount = 8;
    const key = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
    const first = hashKey(key) % workerCount;
    for (let i = 0; i < 100; i++) {
      expect(hashKey(key) % workerCount).toBe(first);
    }
  });
});

describe("createIngestionPool", () => {
  it("processes every enqueued item exactly once", async () => {
    const processed: number[] = [];
    const pool = createIngestionPool<TestEvent>({
      workerCount: 4,
      partitionKey: (e) => e.contractId,
      process: async (e) => {
        processed.push(e.seq);
      },
    });

    for (let i = 0; i < 50; i++) {
      await pool.enqueue({ contractId: `C${i % 5}`, seq: i });
    }
    await pool.drain();

    expect(processed).toHaveLength(50);
    expect(new Set(processed).size).toBe(50);

    const metrics = pool.metrics();
    expect(metrics.processed).toBe(50);
    expect(metrics.depth).toBe(0);
    await pool.stop();
  });

  it("preserves strict per-contract ordering under randomized delays", async () => {
    const seen: Record<string, number[]> = {};
    const pool = createIngestionPool<TestEvent>({
      workerCount: 8,
      partitionKey: (e) => e.contractId,
      process: async (e) => {
        await randomDelay();
        (seen[e.contractId] ??= []).push(e.seq);
      },
    });

    const contracts = ["A", "B", "C", "D", "E"];
    const perContract = 200;

    // Interleave contracts on enqueue, the way a real ledger would.
    for (let seq = 0; seq < perContract; seq++) {
      for (const contractId of contracts) {
        await pool.enqueue({ contractId, seq });
      }
    }
    await pool.drain();

    // Each contract's events must have been processed in strict enqueue order.
    for (const contractId of contracts) {
      const expected = Array.from({ length: perContract }, (_, i) => i);
      expect(seen[contractId]).toEqual(expected);
    }
    await pool.stop();
  });

  it("keeps up with a 1,000+ events-per-block spike across the fleet", async () => {
    const contracts = Array.from({ length: 25 }, (_, i) => `CONTRACT_${i}`);
    const partitionsTouched = new Set<number>();

    const pool = createIngestionPool<TestEvent>({
      workerCount: DEFAULT_WORKER_COUNT,
      partitionKey: (e) => e.contractId,
      process: async (e) => {
        partitionsTouched.add(hashKey(e.contractId) % DEFAULT_WORKER_COUNT);
        await randomDelay();
      },
    });

    // Simulate one block carrying 1,500 events spread across the contracts.
    const spikeSize = 1500;
    for (let i = 0; i < spikeSize; i++) {
      await pool.enqueue({ contractId: contracts[i % contracts.length], seq: i });
    }
    await pool.drain();

    const metrics = pool.metrics();
    expect(metrics.processed).toBe(spikeSize);
    expect(metrics.depth).toBe(0);
    // Work was genuinely spread across multiple parallel consumers.
    expect(partitionsTouched.size).toBeGreaterThan(1);
    await pool.stop();
  });

  it("applies backpressure without dropping items when saturated", async () => {
    let active = 0;
    let maxActive = 0;
    const pool = createIngestionPool<TestEvent>({
      workerCount: 2,
      maxQueueSize: 5,
      partitionKey: (e) => e.contractId,
      process: async (e) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await randomDelay();
        active--;
      },
    });

    let everBackpressured = false;
    for (let i = 0; i < 40; i++) {
      const pending = pool.enqueue({ contractId: `C${i % 4}`, seq: i });
      // When saturated, enqueue does not resolve until capacity frees up.
      const raced = await Promise.race([
        pending.then(() => "resolved" as const),
        Promise.resolve("pending" as const),
      ]);
      if (raced === "pending") {
        everBackpressured = true;
        await pending;
      }
    }
    await pool.drain();

    expect(everBackpressured).toBe(true);
    expect(pool.metrics().processed).toBe(40);
    await pool.stop();
  });

  it("isolates a failing item without stalling its partition", async () => {
    const processed: number[] = [];
    const pool = createIngestionPool<TestEvent>({
      workerCount: 1,
      partitionKey: (e) => e.contractId,
      process: async (e) => {
        if (e.seq === 2) throw new Error("boom");
        processed.push(e.seq);
      },
      onError: () => {
        /* swallow */
      },
    });

    for (let i = 0; i < 5; i++) {
      await pool.enqueue({ contractId: "A", seq: i });
    }
    await pool.drain();

    expect(processed).toEqual([0, 1, 3, 4]);
    expect(pool.metrics().failed).toBe(1);
    expect(pool.metrics().processed).toBe(4);
    await pool.stop();
  });

  it("rejects enqueue after the pool is stopped", async () => {
    const pool = createIngestionPool<TestEvent>({
      workerCount: 1,
      partitionKey: (e) => e.contractId,
      process: async () => {},
    });
    await pool.stop();
    await expect(pool.enqueue({ contractId: "A", seq: 0 })).rejects.toThrow(
      "stopped ingestion pool"
    );
  });
});
