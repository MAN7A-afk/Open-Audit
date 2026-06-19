import { describe, it, expect, vi } from "vitest";
import { translateEvent } from "./registry";
import type { RawEvent } from "./types";

const UNKNOWN_EVENT: RawEvent = {
  id: "unknown-1",
  contractId: "CUNKNOWN000000000000000000000000000000000000000000000",
  topics: ["0xabcdef"],
  data: "0x1234abcd",
  ledger: 1,
  timestamp: Math.floor(Date.now() / 1000),
  txHash: "deadbeef",
};

describe("translateEvent fallback", () => {
  it("returns placeholder and logs a warning when blueprint is missing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const translated = translateEvent(UNKNOWN_EVENT);

    expect(translated.status).toBe("cryptic");
    expect(translated.description).toBeTruthy();
    expect(String(translated.description)).toContain("[Unknown Event:");
    expect(String(translated.description)).toContain("Hex Data: 0x1234abcd");
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
