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
    expect((events[0] as any).contractId.contractId()).toBe(contractId);
    expect((events[0] as any).type).toBe("contract");
  });
});
