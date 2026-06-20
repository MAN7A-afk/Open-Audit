import { describe, it, expect } from "vitest";
import { fetchContractEvents, TESTNET_CONFIG } from "../client";

describe("client integration with MSW", () => {
  it("should successfully fetch contract events without live network connection", async () => {
    const contractId = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
    
    // fetchContractEvents will call getLatestLedger then getEvents
    // our MSW setup intercepts these requests to https://soroban-testnet.stellar.org
    const events = await fetchContractEvents(contractId, TESTNET_CONFIG, 123456);

    expect(events).toBeDefined();
    expect(events.length).toBe(1);
    expect(events[0].ledger).toBe(123456);
    expect(events[0].topics).toHaveLength(3);
  });
});
