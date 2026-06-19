/**
 * Hex decoding utilities for Soroban event data.
 *
 * Soroban events encode their topics and data as XDR (External Data Representation).
 * These helpers provide simplified decoding for common patterns.
 *
 * Supported ScVal Types:
 * - Simple types: Address, U128, I128, String, Symbol, Bytes
 * - Complex types: Map (ScMap), Vector (ScVec), Enum
 *
 * Note: This implementation uses mock decoding for demonstration purposes.
 * In production, use StellarSdk.xdr.ScVal.fromXDR() for full XDR parsing.
 *
 * Security: All hex inputs are validated and sanitized to prevent XSS attacks.
 */

import type {
  DecodedAddress,
  DecodedAmount,
  DecodedScVal,
  DecodedMap,
  DecodedMapEntry,
  DecodedVec,
  DecodedEnum,
  ScValType,
} from "./types";

const STROOP_DIVISOR = BigInt(10_000_000);

/**
 * Validates that a string is a valid hex string (optionally with 0x prefix).
 * Returns true if valid, false otherwise.
 */
export function isValidHex(hex: string): boolean {
  if (typeof hex !== "string") return false;
  const cleanHex = hex.toLowerCase().replace(/^0x/, "");
  return /^[0-9a-f]+$/.test(cleanHex);
}

/**
 * Sanitizes a hex string by ensuring it only contains valid hex characters.
 * Returns the sanitized hex string or an empty string if invalid.
 */
export function sanitizeHex(hex: string): string {
  if (typeof hex !== "string") return "";
  const cleanHex = hex.toLowerCase().replace(/^0x/, "");
  const sanitized = cleanHex.replace(/[^0-9a-f]/g, "");
  return sanitized.length > 0 ? `0x${sanitized}` : "";
}

/**
 * Escapes HTML entities in a string to prevent XSS attacks.
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "/": "&#x2F;",
  };
  return text.replace(/[&<>"'/]/g, (char) => map[char]);
}

/**
 * Shortens a Stellar public key for display.
 * e.g. "GABC...WXYZ1234" → "GABC...1234"
 */
export function shortenAddress(publicKey: string): string {
  if (publicKey.length <= 12) return publicKey;
  return `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`;
}

/**
 * Decodes a mock hex-encoded Stellar address.
 * In production this would use stellar-sdk XDR decoding.
 */
export function decodeAddress(hex: string): DecodedAddress {
  // Validate and sanitize hex input
  const sanitizedHex = sanitizeHex(hex);
  if (!sanitizedHex) {
    return {
      publicKey: "GINVALID",
      short: "GINVALID",
    };
  }

  // Mock: derive a deterministic G-address from the hex for demo purposes.
  // Production: use StellarSdk.xdr.ScVal.fromXDR(hex, 'hex') and extract the address.
  const seed = sanitizedHex.slice(2, 10).toUpperCase();
  const tail = sanitizedHex.slice(-4).toUpperCase();
  const publicKey = `G${seed}${"A".repeat(48 - seed.length)}${tail}`;

  return {
    publicKey,
    short: shortenAddress(publicKey),
  };
}

/**
 * Decodes a mock hex-encoded i128 amount (in stroops) to a human-readable value.
 * In production this would use stellar-sdk XDR decoding.
 */
export function decodeAmount(hex: string, symbol: string = "XLM"): DecodedAmount {
  // Validate and sanitize hex input
  const sanitizedHex = sanitizeHex(hex);
  if (!sanitizedHex) {
    return {
      raw: BigInt(0),
      formatted: "0.00",
      symbol,
    };
  }

  // Mock: derive a deterministic amount from the hex for demo purposes.
  // Production: use StellarSdk.xdr.ScVal.fromXDR(hex, 'hex') and extract the i128.
  const hexValue = sanitizedHex.slice(2, 18);
  const rawValue = BigInt("0x" + hexValue || "0");
  const formatted = (Number(rawValue) / Number(STROOP_DIVISOR)).toFixed(2);

  return {
    raw: rawValue,
    formatted,
    symbol,
  };
}

/**
 * Extracts the event name from the first topic hex string.
 * Soroban encodes event names as Symbol XDR values.
 * In production this would decode the XDR Symbol type.
 */
export function decodeEventName(topicHex: string): string {
  // Validate and sanitize hex input
  const sanitizedHex = sanitizeHex(topicHex);
  if (!sanitizedHex) {
    return "unknown";
  }

  // Mock: map known topic hashes to event names for demo purposes.
  const knownTopics: Record<string, string> = {
    "0x0000000000000000000000000000000000000000000000000000000074726e73":
      "transfer",
    "0x000000000000000000000000000000000000000000000000000000006d696e74":
      "mint",
    "0x000000000000000000000000000000000000000000000000000000006275726e":
      "burn",
    "0x000000000000000000000000000000000000000000000000000000006170707276":
      "approve",
  };

  return knownTopics[sanitizedHex] ?? "unknown";
}

/**
 * Formats a Unix timestamp into a human-readable relative time string.
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Truncates a hex string for display, showing start and end.
 * e.g. "0x000000...FFFF"
 */
export function truncateHex(hex: string, chars: number = 8): string {
  // Validate and sanitize hex input
  const sanitizedHex = sanitizeHex(hex);
  if (!sanitizedHex) {
    return "0xinvalid";
  }

  if (sanitizedHex.length <= chars * 2 + 2) return sanitizedHex;
  return `${sanitizedHex.slice(0, chars + 2)}...${sanitizedHex.slice(-chars)}`;
}

// ── Complex ScVal Type Decoding ─────────────────────────────────────────────

/**
 * Detects the ScVal type from hex-encoded XDR.
 * This is a simplified mock implementation.
 * In production, use StellarSdk.xdr.ScVal.fromXDR() to get the actual type.
 */
export function detectScValType(hex: string): ScValType {
  const sanitizedHex = sanitizeHex(hex);
  if (!sanitizedHex) return "Void";

  // Mock: Simple heuristics to detect type from hex patterns
  // In production, this would use actual XDR parsing
  const cleanHex = sanitizedHex.slice(2);

  // Vec type indicator (simplified)
  if (cleanHex.startsWith("00000010")) return "Vec";
  // Map type indicator (simplified)
  if (cleanHex.startsWith("00000011")) return "Map";
  // Address type indicator (32 bytes)
  if (cleanHex.length === 64) return "Address";
  // String/Symbol type indicator
  if (cleanHex.startsWith("0000000e") || cleanHex.startsWith("0000000f")) return "String";
  // Default to U128 for numeric-looking data
  if (/^[0-9a-f]{32}$/.test(cleanHex)) return "U128";

  return "Bytes";
}

/**
 * Decodes a Soroban Map (ScMap) from hex-encoded XDR.
 * Mock implementation that parses a simplified map structure.
 * In production, use StellarSdk.xdr.ScVal.fromXDR() and extract ScMap.
 */
export function decodeMap(hex: string): DecodedMap {
  const sanitizedHex = sanitizeHex(hex);
  if (!sanitizedHex) {
    return {
      type: "Map",
      entries: [],
      summary: "Invalid map data",
    };
  }

  // Mock: Parse a simplified map structure from hex
  // In production, this would use actual XDR parsing
  const cleanHex = sanitizedHex.slice(2);
  const entries: DecodedMapEntry[] = [];

  // Simplified mock: assume map entries are encoded in pairs
  // This is a placeholder for real XDR parsing
  try {
    // Mock: Extract 2 key-value pairs from the hex for demonstration
    const entryCount = Math.min(2, Math.floor(cleanHex.length / 32));

    for (let i = 0; i < entryCount; i++) {
      const offset = i * 32;
      const keyHex = `0x${cleanHex.slice(offset, offset + 16)}`;
      const valHex = `0x${cleanHex.slice(offset + 16, offset + 32)}`;

      entries.push({
        key: {
          type: detectScValType(keyHex),
          value: truncateHex(keyHex, 4),
          hex: keyHex,
        },
        value: {
          type: detectScValType(valHex),
          value: truncateHex(valHex, 4),
          hex: valHex,
        },
      });
    }
  } catch {
    // If parsing fails, return empty map
  }

  const summary =
    entries.length > 0
      ? `Map(${entries.length} entries: ${entries.map((e) => e.key.value).join(", ")})`
      : "Map(empty)";

  return {
    type: "Map",
    entries,
    summary,
  };
}

/**
 * Decodes a Soroban Vector (ScVec) from hex-encoded XDR.
 * Mock implementation that parses a simplified vector structure.
 * In production, use StellarSdk.xdr.ScVal.fromXDR() and extract ScVec.
 */
export function decodeVec(hex: string): DecodedVec {
  const sanitizedHex = sanitizeHex(hex);
  if (!sanitizedHex) {
    return {
      type: "Vec",
      elements: [],
      summary: "Invalid vector data",
    };
  }

  // Mock: Parse a simplified vector structure from hex
  // In production, this would use actual XDR parsing
  const cleanHex = sanitizedHex.slice(2);
  const elements: DecodedScVal[] = [];

  // Simplified mock: assume vector elements are 16-byte chunks
  try {
    const elementCount = Math.min(4, Math.floor(cleanHex.length / 16));

    for (let i = 0; i < elementCount; i++) {
      const offset = i * 16;
      const elemHex = `0x${cleanHex.slice(offset, offset + 16)}`;

      elements.push({
        type: detectScValType(elemHex),
        value: truncateHex(elemHex, 4),
        hex: elemHex,
      });
    }
  } catch {
    // If parsing fails, return empty vector
  }

  const summary =
    elements.length > 0
      ? `Vec[${elements.map((e) => e.value).join(", ")}]`
      : "Vec[]";

  return {
    type: "Vec",
    elements,
    summary,
  };
}

/**
 * Decodes a Soroban Enum from hex-encoded XDR.
 * Mock implementation that parses a simplified enum structure.
 * In production, use StellarSdk.xdr.ScVal.fromXDR() and extract enum discriminant.
 */
export function decodeEnum(hex: string, knownVariants?: Record<string, string>): DecodedEnum {
  const sanitizedHex = sanitizeHex(hex);
  if (!sanitizedHex) {
    return {
      type: "Enum",
      variant: "unknown",
      summary: "Invalid enum data",
    };
  }

  // Mock: Parse a simplified enum structure from hex
  // In production, this would use actual XDR parsing
  const cleanHex = sanitizedHex.slice(2);

  // Simplified mock: extract discriminant from first 4 bytes
  const discriminantHex = cleanHex.slice(0, 8);
  const discriminant = parseInt(discriminantHex, 16);

  // Map discriminant to variant name (mock implementation)
  const variantNames: Record<number, string> = {
    0: "Default",
    1: "Some",
    2: "None",
    3: "Ok",
    4: "Error",
  };

  const variant = knownVariants?.[discriminantHex] ?? variantNames[discriminant] ?? `Variant_${discriminant}`;

  // Check if there's a payload (remaining hex after discriminant)
  const payloadHex = cleanHex.slice(8);
  let value: DecodedScVal | undefined;

  if (payloadHex.length > 0) {
    value = {
      type: detectScValType(`0x${payloadHex}`),
      value: truncateHex(`0x${payloadHex}`, 4),
      hex: `0x${payloadHex}`,
    };
  }

  const summary = value ? `Enum::${variant}(${value.value})` : `Enum::${variant}`;

  return {
    type: "Enum",
    variant,
    value,
    summary,
  };
}

/**
 * Generic ScVal decoder that dispatches to the appropriate decoder based on type.
 * This is a simplified mock implementation.
 * In production, use StellarSdk.xdr.ScVal.fromXDR() for full XDR parsing.
 */
export function decodeScVal(hex: string): DecodedScVal | DecodedMap | DecodedVec | DecodedEnum {
  const sanitizedHex = sanitizeHex(hex);
  if (!sanitizedHex) {
    return {
      type: "Void",
      value: "invalid",
      hex: "",
    };
  }

  const type = detectScValType(sanitizedHex);

  switch (type) {
    case "Map":
      return decodeMap(sanitizedHex);
    case "Vec":
      return decodeVec(sanitizedHex);
    case "Address":
      const address = decodeAddress(sanitizedHex);
      return {
        type: "Address",
        value: address.short,
        hex: sanitizedHex,
      };
    case "U128":
      const amount = decodeAmount(sanitizedHex);
      return {
        type: "U128",
        value: amount.formatted,
        hex: sanitizedHex,
      };
    default:
      return {
        type,
        value: truncateHex(sanitizedHex, 6),
        hex: sanitizedHex,
      };
  }
}

/**
 * Interpolates a template string by replacing `{key}` placeholders with
 * values from the provided params object.
 *
 * Unknown keys are left as-is (e.g. "{unknown}" stays "{unknown}").
 *
 * @example
 * interpolateTemplate("User {from} sent {amount} tokens to {to}.", {
 *   from: "GABC...1234",
 *   amount: "100.00",
 *   to: "GXYZ...5678",
 * });
 * // → "User GABC...1234 sent 100.00 tokens to GXYZ...5678."
 */
export function interpolateTemplate(
  template: string,
  params: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? params[key] : match
  );
}
