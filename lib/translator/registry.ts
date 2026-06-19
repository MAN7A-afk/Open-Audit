/**
 * The Open-Audit Translation Registry
 *
 * This is the central lookup table that maps Contract IDs to their
 * translation blueprints. When a raw event arrives, the registry:
 *
 *   1. Looks up the contract ID in the blueprint map.
 *   2. Calls the blueprint's translate() function.
 *   3. Returns a TranslatedEvent with a human-readable description,
 *      or marks the event as "cryptic" if no blueprint matches.
 *
 * To add support for a new contract, create a blueprint in ./blueprints/
 * and register it in buildRegistry() below.
 */

import { createAllSacBlueprints } from "./blueprints/sac-transfer";
import { createSacMintBurnBlueprint } from "./blueprints/sac-mint-burn";
import { decodeEventName, decodeAddress, decodeAmount } from "./decode";
import type {
  EventMatchCriteria,
  RawEvent,
  TranslatedEvent,
  TranslationBlueprint,
  Language,
  ContractSchema,
  ContractRegistryEntry,
  TranslationResult,
} from "./types";

/** The registry maps contract IDs to their versioned entries. */
type BlueprintRegistry = Map<string, ContractRegistryEntry>;

/** Cache for resolved schemas to avoid repeated scans of the registry. */
const RESOLUTION_CACHE: Map<string, ContractSchema> = new Map();

/**
 * Interpolates a template string with values from an object.
 * e.g. "Hello {name}" + { name: "World" } -> "Hello World"
 */
function interpolate(template: string, values: Record<string, any>): string {
  return template.replace(/\{([^}]+)\}/g, (match, key) => {
    const [path, format] = key.split(".");
    const val = values[path];
    if (val && typeof val === "object" && format) {
      return val[format] ?? match;
    }
    return val ?? match;
  });
}

/**
 * Creates a translation function from a declarative event mapping.
 */
function createTranslateFromMapping(mapping: any): (event: RawEvent, lang: Language) => TranslationResult | null {
  return (event: RawEvent) => {
    // 1. Match topics
    if (event.topics.length < mapping.topics.length) return null;
    for (let i = 0; i < mapping.topics.length; i++) {
      if (i === 0) {
        if (decodeEventName(event.topics[0]) !== mapping.topics[0]) return null;
      }
      // Future: support matching other topics too
    }

    const fields: Record<string, any> = {};

    // 2. Extract topics[1..]
    mapping.event_structure.topics.forEach((t: any, i: number) => {
      const hex = event.topics[i + 1];
      if (!hex) return;
      if (t.type === "address") fields[t.name] = decodeAddress(hex);
      else if (t.type === "i128") fields[t.name] = decodeAmount(hex);
      else fields[t.name] = hex;
    });

    // 3. Extract data
    if (mapping.event_structure.data) {
      const d = mapping.event_structure.data;
      if (d.type === "i128") fields[d.name] = decodeAmount(event.data);
      else if (d.type === "address") fields[d.name] = decodeAddress(event.data);
      else fields[d.name] = event.data;
    }

    return {
      description: interpolate(mapping.english_template, fields),
      eventType: mapping.topics[0],
    };
  };
}

/**
 * Builds the global blueprint registry by collecting all known blueprints.
 * Add new blueprints here as the community contributes them.
 */
function buildRegistry(): BlueprintRegistry {
  const registry: BlueprintRegistry = new Map();

  /** Helper to add or merge a blueprint into the registry with versioning. */
  function register(blueprint: TranslationBlueprint, version = "1.0.0", fromLedger = 0) {
    let entry = registry.get(blueprint.contractId);
    if (!entry) {
      entry = {
        contractId: blueprint.contractId,
        contractName: blueprint.contractName,
        schemas: [],
      };
      registry.set(blueprint.contractId, entry);
    }

    entry.schemas.push({
      version,
      validFromLedger: fromLedger,
      validToLedger: null,
      blueprint,
    });

    entry.schemas.sort((a, b) => a.validFromLedger - b.validFromLedger);
    for (let i = 0; i < entry.schemas.length - 1; i++) {
      entry.schemas[i].validToLedger = entry.schemas[i + 1].validFromLedger - 1;
    }
  }

  // 1. Load Hardcoded Blueprints
  for (const blueprint of createAllSacBlueprints()) {
    register(blueprint);
  }

  const mintBurnContracts = [
    "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
    "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  ];
  for (const contractId of mintBurnContracts) {
    const mintBurnBlueprint = createSacMintBurnBlueprint(contractId);
    const existing = registry.get(contractId);
    if (existing && existing.schemas.length > 0) {
      const latestSchema = existing.schemas[existing.schemas.length - 1];
      const originalTranslate = latestSchema.blueprint.translate;
      latestSchema.blueprint = {
        ...latestSchema.blueprint,
        translate: (event, lang) => originalTranslate(event, lang) ?? mintBurnBlueprint.translate(event, lang),
      };
    } else {
      register(mintBurnBlueprint);
    }
  }

  return registry;
}

/**
 * Dynamically registers a new schema for a contract.
 * Useful for handling contract upgrades (update_current_contract_wasm) at runtime.
 */
export function registerUpgrade(
  contractId: string,
  version: string,
  fromLedger: number,
  eventMappings: any[]
) {
  const entry = REGISTRY.get(contractId);
  if (!entry) return;

  const blueprint: TranslationBlueprint = {
    contractId,
    contractName: entry.contractName,
    translate: (event, lang) => {
      for (const mapping of eventMappings) {
        const result = createTranslateFromMapping(mapping)(event, lang);
        if (result) return result;
      }
      return null;
    },
  };

  entry.schemas.push({
    version,
    validFromLedger: fromLedger,
    validToLedger: null,
    blueprint,
  });

  entry.schemas.sort((a, b) => a.validFromLedger - b.validFromLedger);
  for (let i = 0; i < entry.schemas.length - 1; i++) {
    entry.schemas[i].validToLedger = entry.schemas[i + 1].validFromLedger - 1;
  }

  // Clear cache for this contract to force re-resolution
  RESOLUTION_CACHE.forEach((_, key) => {
    if (key.startsWith(`${contractId}:`)) {
      RESOLUTION_CACHE.delete(key);
    }
  });
}

/** Singleton registry instance. */
const REGISTRY: BlueprintRegistry = buildRegistry();

/**
 * Resolves the correct schema version for a given contract and ledger.
 */
function resolveSchema(
  contractId: string,
  ledger: number,
  customBlueprints?: Map<string, TranslationBlueprint>
): ContractSchema | null {
  // 1. Check Custom (local) blueprints first. 
  // Custom blueprints are currently not versioned in this implementation, 
  // but we treat them as "always valid" for the current session.
  const custom = customBlueprints?.get(contractId);
  if (custom) {
    return {
      version: "custom",
      validFromLedger: 0,
      validToLedger: null,
      blueprint: custom,
    };
  }

  // 2. Check cache
  const cacheKey = `${contractId}:${ledger}`;
  const cached = RESOLUTION_CACHE.get(cacheKey);
  if (cached) return cached;

  // 3. Look up in global registry
  const entry = REGISTRY.get(contractId);
  if (!entry) return null;

  // 4. Find matching ledger window
  const schema = entry.schemas.find(
    (s) => ledger >= s.validFromLedger && (s.validToLedger === null || ledger <= s.validToLedger)
  );

  if (schema) {
    RESOLUTION_CACHE.set(cacheKey, schema);
    return schema;
  }

  return null;
}

/**
 * Translates a single raw Soroban event into a human-readable TranslatedEvent.
 */
export function translateEvent(
  event: RawEvent,
  customBlueprints?: Map<string, TranslationBlueprint>,
  lang: Language = "en"
): TranslatedEvent {
  const schema = resolveSchema(event.contractId, event.ledger, customBlueprints);

  if (!schema) {
    return {
      raw: event,
      description: null,
      status: "cryptic",
      blueprintName: null,
      eventType: null,
    };
  }

  const translated = applyBlueprint(event, schema.blueprint, lang);
  if (translated) return translated;

  return {
    raw: event,
    description: null,
    status: "cryptic",
    blueprintName: schema.blueprint.contractName,
    eventType: null,
  };
}

/**
 * Runs a single blueprint against an event, returning a translated event or
 * null when the blueprint cannot handle it.
 */
function applyBlueprint(event: RawEvent, blueprint: TranslationBlueprint, lang: Language): TranslatedEvent | null {
  if (blueprint.matches && !blueprint.matches(event)) return null;

  const result = blueprint.translate(event, lang);
  if (!result) return null;

  return {
    raw: event,
    description: result.description,
    status: "translated",
    blueprintName: blueprint.contractName,
    eventType: result.eventType,
  };
}

/**
 * Returns true when an event satisfies every requested criterion.
 * Useful for blueprints that must match more than the event signature topic.
 */
export function matchesEventCriteria(
  event: RawEvent,
  criteria: EventMatchCriteria
): boolean {
  if (criteria.contractId && event.contractId !== criteria.contractId) {
    return false;
  }

  for (const topicCriteria of criteria.topics ?? []) {
    const topic = event.topics[topicCriteria.index];
    if (typeof topic !== "string") return false;

    if (topicCriteria.equals && topic !== topicCriteria.equals) {
      return false;
    }

    if (
      topicCriteria.includes &&
      !topic.toLowerCase().includes(topicCriteria.includes.toLowerCase())
    ) {
      return false;
    }

    if (
      topicCriteria.decodedName &&
      decodeEventName(topic) !== topicCriteria.decodedName
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Translates a batch of raw events.
 * Preserves order and handles errors per-event gracefully.
 *
 * @param customBlueprints Optional per-session blueprints (e.g. uploaded ABIs)
 *   that are consulted before the global registry.
 */
export function translateEvents(
  events: RawEvent[],
  customBlueprints?: Map<string, TranslationBlueprint>,
  lang: Language = "en"
): TranslatedEvent[] {
  return events.map(function (event: RawEvent): TranslatedEvent {
    try {
      return translateEvent(event, customBlueprints, lang);
    } catch {
      return {
        raw: event,
        description: null,
        status: "cryptic",
        blueprintName: null,
        eventType: null,
      };
    }
  });
}

/**
 * Returns true if a contract ID has a registered blueprint.
 */
export function hasBlueprint(contractId: string): boolean {
  return REGISTRY.has(contractId);
}

/**
 * Returns the list of all registered contract IDs.
 */
export function getRegisteredContracts(): string[] {
  return Array.from(REGISTRY.keys());
}

/**
 * Returns the number of registered blueprints.
 */
export function getBlueprintCount(): number {
  return REGISTRY.size;
}
