import type { Tier } from "./apiKey";

// Sliding-window limits in requests per minute per tier
const TIER_LIMITS: Record<Tier, number> = {
  free: 60,
  partner: 5000,
};

const buckets = new Map<string, number[]>();

function getBucket(hashedKey: string): number[] {
  const existing = buckets.get(hashedKey);
  if (existing) {
    return existing;
  }

  const created: number[] = [];
  buckets.set(hashedKey, created);
  return created;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter?: number; // seconds
}

/**
 * Sliding-window rate limiter using a Redis sorted set.
 *
 * Key: oa:rl:{hashedKey}
 * Members: timestamps of recent requests
 * Window: 60 seconds
 */
export async function checkRateLimit(
  hashedKey: string,
  tier: Tier
): Promise<RateLimitResult> {
  const limit = TIER_LIMITS[tier];
  const bucket = getBucket(hashedKey);
  const now = Date.now();
  const windowMs = 60_000;

  while (bucket.length > 0 && bucket[0] <= now - windowMs) {
    bucket.shift();
  }

  const allowed = bucket.length < limit;
  if (allowed) {
    bucket.push(now);
  }

  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - bucket.length),
    retryAfter: allowed ? undefined : Math.ceil((bucket[0] + windowMs - now) / 1000),
  };
}
