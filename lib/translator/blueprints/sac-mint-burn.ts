/**
 * Translation Blueprint: Stellar Asset Contract (SAC) — Mint & Burn Events
 *
 * Mint: tokens are created and sent to an account.
 *   topics[0] = Symbol("mint")
 *   topics[1] = Address(admin)
 *   topics[2] = Address(to)
 *   data      = i128(amount)
 *
 * Burn: tokens are destroyed from an account.
 *   topics[0] = Symbol("burn")
 *   topics[1] = Address(from)
 *   data      = i128(amount)
 */

import { decodeAddress, decodeAmount, interpolateTemplate } from "../decode";
import type { TranslationBlueprint, TranslationResult, RawEvent } from "../types";

const KNOWN_SYMBOLS: Record<string, string> = {
  CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC: "USDC",
  CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA: "XLM",
  CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM: "USDC",
  CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB: "XLM",
};

/**
 * Attempts to translate a SAC mint event.
 */
function translateMint(event: RawEvent): TranslationResult | null {
  if (!event.topics[0]?.includes("6d696e74")) return null;

  const symbol = KNOWN_SYMBOLS[event.contractId] ?? "TOKEN";
  const admin = decodeAddress(event.topics[1] ?? "0x00");
  const to = decodeAddress(event.topics[2] ?? "0x00");
  const amount = decodeAmount(event.data, symbol);

  return {
    description: interpolateTemplate(
      "Admin [{admin}] minted {amount} {symbol} to [{to}]",
      { admin: admin.short, to: to.short, amount: amount.formatted, symbol }
    ),
    eventType: "Mint",
  };
}

/**
 * Attempts to translate a SAC burn event.
 */
function translateBurn(event: RawEvent): TranslationResult | null {
  if (!event.topics[0]?.includes("6275726e")) return null;

  const symbol = KNOWN_SYMBOLS[event.contractId] ?? "TOKEN";
  const from = decodeAddress(event.topics[1] ?? "0x00");
  const amount = decodeAmount(event.data, symbol);

  return {
    description: interpolateTemplate(
      "Public Key [{from}] burned {amount} {symbol}",
      { from: from.short, amount: amount.formatted, symbol }
    ),
    eventType: "Burn",
  };
}

/**
 * Creates the SAC Mint/Burn translation blueprint.
 */
export function createSacMintBurnBlueprint(contractId: string): TranslationBlueprint {
  const symbol = KNOWN_SYMBOLS[contractId] ?? "TOKEN";

  return {
    contractId,
    contractName: `Stellar Asset Contract — Mint/Burn (${symbol})`,
    translate: function (event: RawEvent): TranslationResult | null {
      return translateMint(event) ?? translateBurn(event);
    },
  };
}
