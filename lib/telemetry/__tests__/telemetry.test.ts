import { describe, it, expect, vi, beforeEach } from "vitest";
import { XdrParsingException } from "@/lib/errors";
import { captureExceptionSync } from "@/lib/telemetry";

describe("telemetry captureExceptionSync", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("logs structured payloads with fingerprint for grouping", () => {
    const error = new XdrParsingException("decode failed", {
      contractId: "CABC123",
      ledgerSequence: 99,
      xdrHex: "cafebabe",
    });

    const normalized = captureExceptionSync(error);

    expect(normalized.code).toBe("XDR_PARSING_ERROR");
    expect(console.error).toHaveBeenCalled();

    const logged = (console.error as ReturnType<typeof vi.fn>).mock.calls[0].join(" ");
    expect(logged).toContain("[open-audit:telemetry]");
    expect(logged).toContain("XDR_PARSING_ERROR");
    expect(logged).toContain("CABC123");
  });
});
