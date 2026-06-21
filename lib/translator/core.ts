/**
 * Core translation and interpolation logic for Open-Audit.
 * This module is designed to be pure and free of side effects.
 */

import type {
  DecodedAddress,
  DecodedAmount,
  DecodedEnum,
  DecodedMap,
  DecodedMapEntry,
  DecodedScVal,
  DecodedVec,
  ScValType,
} from "./types";

/**
 * Sanitizes a single parameter value before it is interpolated into a template.
 *
 * Security guarantees:
 *   - HTML special characters are escaped so values cannot inject markup or
 *     script tags into dashboard descriptions rendered as innerHTML.
 *   - The string is trimmed and capped at MAX_PARAM_LENGTH to prevent
 *     resource-exhaustion via extremely long blockchain payloads.
 *   - No eval(), Function(), or dynamic code execution is used anywhere in
 *     the interpolation pipeline.
 */
const MAX_PARAM_LENGTH = 512;

export function sanitizeTemplateParam(value: string): string {
  if (typeof value !== "string") return "";
  return escapeHtml(value.trim().slice(0, MAX_PARAM_LENGTH));
}

/**
 * Sanitizes a translated text field (description, eventType, blueprintName)
 * before it is stored or surfaced in the UI.
 *
 * Options:
 *   maxLength  — hard cap on output length (default: 1024)
 *   allowHex   — when true, skips HTML-escaping for hex-only strings like
 *                contract addresses and tx hashes (they can't carry XSS payloads)
 */
export interface SanitizeOptions {
  maxLength?: number;
  allowHex?: boolean;
}

export function sanitizeTextField(
  value: string,
  options: SanitizeOptions = {}
): string {
  if (typeof value !== "string") return "";
  const { maxLength = 1024, allowHex = false } = options;
  const trimmed = value.trim().slice(0, maxLength);
  if (allowHex && /^(0x)?[0-9a-fA-F\s.]+$/.test(trimmed)) return trimmed;
  return escapeHtml(trimmed);
}

/**
 * Replaces placeholders in a template string with values from a params dictionary.
 * e.g. "User {from} sent {amount} tokens" -> "User GABC...1234 sent 100.00 tokens"
 *
 * Security: every param value is passed through sanitizeTemplateParam() before
 * substitution so blockchain-sourced data cannot inject HTML or script content.
 * Token replacement uses a plain string replace — no eval() or Function() calls.
 */
export function interpolateTemplate(
  template: string,
  params: Record<string, string>
): string {
  if (typeof template !== "string") return "";
  // Sanitize the template itself to prevent stored-XSS via contributed templates
  const safeTemplate = escapeHtml(template.slice(0, 2048));
  return safeTemplate.replace(/\{(\w+)\}/g, (match, key) => {
    if (params[key] === undefined) return match;
    return sanitizeTemplateParam(params[key]);
  });
}

/**
 * Checks if a string is a valid hex-encoded value.
 */
export function isValidHex(hex: string): boolean {
  if (!hex) return false;
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  return /^[0-9a-fA-F]+$/.test(cleanHex);
}

/**
 * Sanitizes a string to be a valid hex value.
 * Removes non-hex characters and ensures it starts with "0x".
 */
export function sanitizeHex(hex: string): string {
  if (!hex) return "";
  const cleanInput = hex.startsWith("0x") ? hex.slice(2) : hex;
  const clean = cleanInput.replace(/[^0-9a-fA-F]/g, "");
  if (!clean) return "";
  return `0x${clean}`;
}

/**
 * Escapes HTML special characters to prevent XSS.
 */
export function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return str.replace(/[&<>"']/g, (m) => map[m]);
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
 */
export function decodeAddress(hex: string): DecodedAddress {
  const seed = hex.slice(2, 10).toUpperCase();
  const tail = hex.slice(-4).toUpperCase();
  const publicKey = `G${seed}${"A".repeat(48 - seed.length)}${tail}`;

  return {
    publicKey,
    short: shortenAddress(publicKey),
  };
}

const STROOP_DIVISOR = BigInt(10_000_000);

/**
 * Decodes a mock hex-encoded i128 amount (in stroops) to a human-readable value.
 */
export function decodeAmount(hex: string, symbol: string = "XLM"): DecodedAmount {
  const rawValue = BigInt("0x" + hex.slice(2, 18).replace(/[^0-9a-fA-F]/g, "0") || "0");
  const formatted = (Number(rawValue) / Number(STROOP_DIVISOR)).toFixed(2);

  return {
    raw: rawValue,
    formatted,
    symbol,
  };
}

/**
 * Extracts the event name from the first topic hex string.
 */
export function decodeEventName(topicHex: string): string {
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

  return knownTopics[topicHex] ?? "unknown";
}

/**
 * Truncates a hex string for display, showing start and end.
 */
export function truncateHex(hex: string, chars: number = 8): string {
  if (hex.length <= chars * 2 + 2) return hex;
  return `${hex.slice(0, chars + 2)}...${hex.slice(-chars)}`;
}

/**
 * Detects the Soroban ScVal type from a hex string.
 */
export function detectScValType(hex: string): ScValType {
  if (!isValidHex(hex)) return "Void";

  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;

  if (clean.startsWith("00000010")) return "Vec";
  if (clean.startsWith("00000011")) return "Map";
  if (clean.startsWith("0000000e") || clean.startsWith("0000000f")) return "String";

  if (clean.length === 64) return "Address";
  if (clean.length === 32) return "U128";

  return "Bytes";
}

/**
 * Decodes a Soroban Map from hex.
 */
export function decodeMap(hex: string): DecodedMap {
  if (!isValidHex(hex)) {
    return { type: "Map", entries: [], summary: "Invalid map data" };
  }
  if (!hex) {
    return { type: "Map", entries: [], summary: "" };
  }

  // Mock decoding: just create one dummy entry if it's a valid map hex
  const entries: DecodedMapEntry[] = [];
  if (hex.length > 10) {
    entries.push({
      key: { type: "String", value: "key1", hex: "0x... " },
      value: { type: "String", value: "value1", hex: "0x... " },
    });
  }

  return {
    type: "Map",
    entries,
    summary: `Map with ${entries.length} entries`,
  };
}

/**
 * Decodes a Soroban Vector from hex.
 */
export function decodeVec(hex: string): DecodedVec {
  if (!isValidHex(hex)) {
    return { type: "Vec", elements: [], summary: "Invalid vector data" };
  }
  if (!hex) {
    return { type: "Vec", elements: [], summary: "" };
  }

  const elements: DecodedScVal[] = [];
  if (hex.length > 10) {
    elements.push({ type: "String", value: "elem1", hex: "0x... " });
  }

  return {
    type: "Vec",
    elements,
    summary: `Vec with ${elements.length} elements`,
  };
}

/**
 * Decodes a Soroban Enum from hex.
 */
export function decodeEnum(hex: string, knownVariants?: Record<string, string>): DecodedEnum {
  if (!isValidHex(hex)) {
    return { type: "Enum", variant: "unknown", summary: "Invalid enum data" };
  }

  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const variantHex = clean.slice(0, 8);
  const variant = knownVariants?.[variantHex] ?? `variant_${variantHex}`;

  const hasPayload = clean.length > 8;
  const value = hasPayload
    ? { type: "Bytes", value: clean.slice(8), hex: `0x${clean.slice(8)}` }
    : undefined;

  return {
    type: "Enum",
    variant,
    value,
    summary: `Enum variant ${variant}${hasPayload ? " (with payload)" : ""}`,
  };
}

/**
 * Decodes a general Soroban ScVal from hex.
 */
export function decodeScVal(hex: string): DecodedScVal {
  const type = detectScValType(hex);

  switch (type) {
    case "Map":
      return decodeMap(hex);
    case "Vec":
      return decodeVec(hex);
    case "Address":
    case "U128":
    case "Void":
      return {
        type,
        value: hex,
        hex,
      };
    default:
      return {
        type: "Bytes",
        value: hex,
        hex,
      };
  }
}
