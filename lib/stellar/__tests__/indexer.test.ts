/**
 * Tests for the Stellar Event Indexer with rate limit handling.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { SorobanRpc } from "stellar-sdk";
import {
  fetchEventsWithRetry,
  startEventIndexer,
  calculateRetryDelay,
  DEFAULT_RETRY_CONFIG,
  type IndexerCursor,
} from "../indexer";
import { StellarNetworkException } from "../../errors";

const jest = vi;

// Mock stellar-sdk
vi.mock("stellar-sdk", function () {
  return {
    SorobanRpc: {
      Server: vi.fn(),
    },
  };
});

describe("calculateRetryDelay", function () {
  it("should calculate exponential backoff correctly", function () {
    const config = {
      initialDelayMs: 1000,
      maxDelayMs: 32000,
      maxRetries: 10,
      backoffMultiplier: 2,
    };

    expect(calculateRetryDelay(0, config)).toBe(1000); // 1s
    expect(calculateRetryDelay(1, config)).toBe(2000); // 2s
    expect(calculateRetryDelay(2, config)).toBe(4000); // 4s
    expect(calculateRetryDelay(3, config)).toBe(8000); // 8s
    expect(calculateRetryDelay(4, config)).toBe(16000); // 16s
    expect(calculateRetryDelay(5, config)).toBe(32000); // Capped at 32s
    expect(calculateRetryDelay(6, config)).toBe(32000); // Still capped
  });
});

describe("fetchEventsWithRetry", function () {
  let mockServer: {
    getEvents: jest.Mock;
  };

  beforeEach(function () {
    mockServer = {
      getEvents: jest.fn(),
    };
  });

  it("should return events on successful fetch", async function () {
    const mockResponse = {
      events: [{ id: "event-1" }, { id: "event-2" }],
      latestLedger: 2000,
    };

    mockServer.getEvents.mockResolvedValue(mockResponse);

    const result = await fetchEventsWithRetry(
      mockServer as unknown as SorobanRpc.Server,
      ["contract-1"],
      1000,
      undefined,
      DEFAULT_RETRY_CONFIG
    );

    expect(result).toEqual(mockResponse);
    expect(mockServer.getEvents).toHaveBeenCalledTimes(1);
    expect(mockServer.getEvents).toHaveBeenCalledWith({
      startLedger: 1000,
      filters: [{ type: "contract", contractIds: ["contract-1"] }],
    });
  });

  it("should retry on HTTP 429 error and eventually succeed", async function () {
    const mockResponse = {
      events: [{ id: "event-1" }],
      latestLedger: 2000,
    };

    // Fail twice with 429, then succeed
    mockServer.getEvents
      .mockRejectedValueOnce(new Error("HTTP 429: Too Many Requests"))
      .mockRejectedValueOnce(new Error("Rate limit exceeded"))
      .mockResolvedValueOnce(mockResponse);

    const result = await fetchEventsWithRetry(
      mockServer as unknown as SorobanRpc.Server,
      ["contract-1"],
      1000,
      undefined,
      {
        initialDelayMs: 10, // Short delays for tests
        maxDelayMs: 100,
        maxRetries: 5,
        backoffMultiplier: 2,
      }
    );

    expect(result).toEqual(mockResponse);
    expect(mockServer.getEvents).toHaveBeenCalledTimes(3);
  });

  it("should throw immediately on non-retriable errors", async function () {
    mockServer.getEvents.mockRejectedValue(new Error("Invalid filter parameter"));

    await expect(
      fetchEventsWithRetry(
        mockServer as unknown as SorobanRpc.Server,
        ["contract-1"],
        1000,
        undefined,
        DEFAULT_RETRY_CONFIG
      )
    ).rejects.toBeInstanceOf(StellarNetworkException);

    expect(mockServer.getEvents).toHaveBeenCalledTimes(1);
  });

  it("should throw after exhausting all retries", async function () {
    mockServer.getEvents.mockRejectedValue(new Error("429 Too Many Requests"));

    await expect(
      fetchEventsWithRetry(
        mockServer as unknown as SorobanRpc.Server,
        ["contract-1"],
        1000,
        undefined,
        {
          initialDelayMs: 10,
          maxDelayMs: 100,
          maxRetries: 2,
          backoffMultiplier: 2,
        }
      )
    ).rejects.toThrow(/Failed to fetch events after 2 retries/);

    expect(mockServer.getEvents).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });
});

describe("startEventIndexer", function () {
  let mockServer: {
    getEvents: jest.Mock;
  };

  beforeEach(function () {
    jest.useFakeTimers();
    mockServer = {
      getEvents: jest.fn(),
    };

    // Mock the SorobanRpc.Server constructor
    vi.mocked(SorobanRpc.Server).mockImplementation(function () {
      return mockServer as any;
    });
  });

  afterEach(function () {
    jest.useRealTimers();
  });

  it("should poll events and update cursor only on success", async function () {
    const mockResponse = {
      events: [{ id: "event-1" }],
      latestLedger: 2000,
      cursor: "cursor-1",
    };

    mockServer.getEvents.mockResolvedValue(mockResponse);

    const onEvents = jest.fn();
    const onError = jest.fn();

    const indexer = startEventIndexer({
      networkConfig: {
        horizonUrl: "https://horizon-testnet.stellar.org",
        sorobanRpcUrl: "https://soroban-testnet.stellar.org",
        networkPassphrase: "Test SDF Network ; September 2015",
      },
      contractIds: ["contract-1"],
      startLedger: 1000,
      pollIntervalMs: 5000,
      onEvents,
      onError,
      retryConfig: {
        initialDelayMs: 10,
        maxDelayMs: 100,
        maxRetries: 3,
        backoffMultiplier: 2,
      },
    });

    // Wait for first poll
    await jest.advanceTimersByTimeAsync(100);

    expect(mockServer.getEvents).toHaveBeenCalled();
    expect(onEvents).toHaveBeenCalledWith(mockResponse.events, expect.any(Object));
    expect(onError).not.toHaveBeenCalled();

    // Check cursor was updated
    const cursor = indexer.getCursor();
    expect(cursor.lastLedger).toBe(2000);
    expect(cursor.paginationCursor).toBe("cursor-1");

    indexer.stop();
  });

  it("should not update cursor on fetch failure", async function () {
    mockServer.getEvents.mockRejectedValue(new Error("Network error"));

    const onEvents = jest.fn();
    const onError = jest.fn();

    const indexer = startEventIndexer({
      networkConfig: {
        horizonUrl: "https://horizon-testnet.stellar.org",
        sorobanRpcUrl: "https://soroban-testnet.stellar.org",
        networkPassphrase: "Test SDF Network ; September 2015",
      },
      contractIds: ["contract-1"],
      startLedger: 1000,
      pollIntervalMs: 5000,
      onEvents,
      onError,
      retryConfig: {
        initialDelayMs: 10,
        maxDelayMs: 100,
        maxRetries: 1,
        backoffMultiplier: 2,
      },
    });

    // Wait for first poll
    await jest.advanceTimersByTimeAsync(100);

    expect(onEvents).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();

    // Check cursor was NOT updated
    const cursor = indexer.getCursor();
    expect(cursor.lastLedger).toBe(1000); // Still at starting ledger

    indexer.stop();
  });

  it("should handle rate limit errors with retry", async function () {
    const mockResponse = {
      events: [{ id: "event-1" }],
      latestLedger: 2000,
    };

    // Fail once with 429, then succeed
    mockServer.getEvents
      .mockRejectedValueOnce(new Error("429 Too Many Requests"))
      .mockResolvedValueOnce(mockResponse);

    const onEvents = jest.fn();
    const onError = jest.fn();

    const indexer = startEventIndexer({
      networkConfig: {
        horizonUrl: "https://horizon-testnet.stellar.org",
        sorobanRpcUrl: "https://soroban-testnet.stellar.org",
        networkPassphrase: "Test SDF Network ; September 2015",
      },
      contractIds: ["contract-1"],
      startLedger: 1000,
      pollIntervalMs: 5000,
      onEvents,
      onError,
      retryConfig: {
        initialDelayMs: 10,
        maxDelayMs: 100,
        maxRetries: 3,
        backoffMultiplier: 2,
      },
    });

    // Wait for retries
    await jest.advanceTimersByTimeAsync(500);

    expect(mockServer.getEvents).toHaveBeenCalledTimes(2);
    expect(onEvents).toHaveBeenCalledWith(mockResponse.events, expect.any(Object));

    indexer.stop();
  });
});
