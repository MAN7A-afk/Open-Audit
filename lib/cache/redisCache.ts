import Redis from "ioredis";

let client: Redis | null = null;

export function isRedisEnabled(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export function initRedis(): void {
  if (!isRedisEnabled()) return;
  if (client) return;
  client = new Redis(process.env.REDIS_URL as string);
  client.on("error", (err) => {
    console.error("[redis] Redis client error:", err);
  });
}

function makeKey(sorobanUrl: string, contractIds: string[], startLedger: number) {
  const ids = contractIds.join(",");
  return `open-audit:events:${sorobanUrl}:${ids}:${startLedger}`;
}

export async function getCachedEvents(
  sorobanUrl: string,
  contractIds: string[],
  startLedger: number
): Promise<any | null> {
  if (!isRedisEnabled()) return null;
  try {
    if (!client) initRedis();
    if (!client) return null;
    const key = makeKey(sorobanUrl, contractIds, startLedger);
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn("[redis] Error reading cache:", err);
    return null;
  }
}

export async function setCachedEvents(
  sorobanUrl: string,
  contractIds: string[],
  startLedger: number,
  value: any
): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    if (!client) initRedis();
    if (!client) return;
    const key = makeKey(sorobanUrl, contractIds, startLedger);
    const ttl = process.env.REDIS_TTL_SECONDS
      ? parseInt(process.env.REDIS_TTL_SECONDS, 10)
      : 0;
    const raw = JSON.stringify(value);
    if (ttl > 0) {
      await client.set(key, raw, "EX", ttl);
    } else {
      await client.set(key, raw);
    }
  } catch (err) {
    console.warn("[redis] Error writing cache:", err);
  }
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
