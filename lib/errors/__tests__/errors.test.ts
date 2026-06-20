import { describe, it, expect } from "vitest";
import {
  OpenAuditError,
  StellarNetworkException,
  XdrParsingException,
  RegistryTemplateException,
  isOpenAuditError,
  normalizeError,
} from "../index";

describe("OpenAuditError hierarchy", () => {
  it("serializes domain exceptions to structured JSON", () => {
    const error = new XdrParsingException("Invalid XDR payload", {
      contractId: "CABC123",
      ledgerSequence: 42,
      xdrHex: "deadbeef",
    });

    expect(error.toJSON()).toEqual({
      code: "XDR_PARSING_ERROR",
      message: "Invalid XDR payload",
      context: {
        contractId: "CABC123",
        ledgerSequence: 42,
        xdrHex: "deadbeef",
      },
    });
  });

  it("fingerprints errors by code and contract for alert grouping", () => {
    const error = new StellarNetworkException("RPC timeout", {
      contractId: "CABC123",
    });

    expect(error.fingerprint()).toEqual(["STELLAR_NETWORK_ERROR", "CABC123"]);
  });

  it("normalizes generic errors into domain exceptions when possible", () => {
    const xdrError = normalizeError(new Error("Failed to decode XDR body"), "fallback", {
      contractId: "CXYZ",
    });
    expect(xdrError).toBeInstanceOf(XdrParsingException);
    expect(xdrError.context.contractId).toBe("CXYZ");

    const networkError = normalizeError(new Error("ETIMEDOUT connecting to RPC"), "fallback", {
      contractId: "CXYZ",
    });
    expect(networkError).toBeInstanceOf(StellarNetworkException);
    expect((networkError as StellarNetworkException).retriable).toBe(true);
  });

  it("identifies OpenAuditError instances", () => {
    const error = new RegistryTemplateException("Missing ABI field", {
      contractId: "C123",
      operation: "parseCustomAbi",
    });

    expect(isOpenAuditError(error)).toBe(true);
    expect(isOpenAuditError(new Error("plain"))).toBe(false);
    expect(error).toBeInstanceOf(OpenAuditError);
  });
});
