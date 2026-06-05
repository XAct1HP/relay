import "server-only";

import {
  IntegrationAuthError,
  type AuthenticatedIntegrationSeller,
} from "@/lib/integration-auth";

const INTEGRATION_RATE_LIMIT = 60;
const INTEGRATION_RATE_WINDOW_MS = 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

interface RateLimitBucket {
  timestamps: number[];
}

const rateLimitBuckets = new Map<string, RateLimitBucket>();
let lastCleanupAt = 0;

export function enforceIntegrationRateLimit(auth: AuthenticatedIntegrationSeller) {
  const now = Date.now();
  cleanupExpiredBuckets(now);

  const bucketKey = auth.apiKeyId || auth.sellerId;
  const bucket = rateLimitBuckets.get(bucketKey) || { timestamps: [] };
  const windowStart = now - INTEGRATION_RATE_WINDOW_MS;

  bucket.timestamps = bucket.timestamps.filter((timestamp) => timestamp > windowStart);

  if (bucket.timestamps.length >= INTEGRATION_RATE_LIMIT) {
    const oldestTimestamp = bucket.timestamps[0] || now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldestTimestamp + INTEGRATION_RATE_WINDOW_MS - now) / 1000)
    );

    throw new IntegrationAuthError(
      "rate_limited",
      `Rate limit exceeded. Max ${INTEGRATION_RATE_LIMIT} requests per minute per API key. Try again in ${retryAfterSeconds} seconds.`,
      429,
      retryAfterSeconds
    );
  }

  bucket.timestamps.push(now);
  rateLimitBuckets.set(bucketKey, bucket);
}

function cleanupExpiredBuckets(now: number) {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
    return;
  }

  const cutoff = now - INTEGRATION_RATE_WINDOW_MS;

  for (const [key, bucket] of Array.from(rateLimitBuckets.entries())) {
    bucket.timestamps = bucket.timestamps.filter((timestamp) => timestamp > cutoff);

    if (bucket.timestamps.length === 0) {
      rateLimitBuckets.delete(key);
    } else {
      rateLimitBuckets.set(key, bucket);
    }
  }

  lastCleanupAt = now;
}

// TODO: Replace this in-memory limiter with a durable shared store (Redis/Upstash/Supabase)
// before relying on it for strict enforcement across multiple server instances.
