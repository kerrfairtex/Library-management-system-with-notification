/**
 * Rate limiter with Redis (Upstash) backend and in-memory fallback.
 *
 * Priority: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *           → ioredis (REDIS_URL)
 *           → in-memory (process local)
 *
 * All implementations share the same interface: rateLimit(key, max, windowMs)
 * and clientIp(request).
 */

import { clientIp } from "./rate-limit-ip.ts";

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

// ──────────────────────────────────────────────────────────────────────────
// In-memory fallback (original implementation, kept for zero-dep operation)
// ──────────────────────────────────────────────────────────────────────────
type MemEntry = { count: number; resetAt: number };
const memBuckets = new Map<string, MemEntry>();

function memPrune(now: number): void {
  if (memBuckets.size < 10_000) return;
  for (const [key, entry] of memBuckets) {
    if (now >= entry.resetAt) memBuckets.delete(key);
  }
}

function memRateLimit(
  key: string,
  max: number,
  windowMs: number = DEFAULT_WINDOW_MS
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  memPrune(now);

  const entry = memBuckets.get(key);
  if (!entry || now >= entry.resetAt) {
    memBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.count >= max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

// ──────────────────────────────────────────────────────────────────────────
// Upstash Redis REST API implementation
// ──────────────────────────────────────────────────────────────────────────
let upstashClient: UpstashClient | null = null;

interface UpstashClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  eval(script: string, keys: string[], args: (string | number)[]): Promise<number>;
}

function getUpstashClient(): UpstashClient | null {
  if (upstashClient) return upstashClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  upstashClient = {
    async incr(key: string) {
      const res = await fetch(`${url}/incr/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Upstash INCR failed: ${res.status}`);
      const data = await res.json();
      return data.result as number;
    },
    async expire(key: string, seconds: number) {
      const res = await fetch(`${url}/expire/${encodeURIComponent(key)}/${seconds}`, {
        headers: { Authorization: `Bearer ${token}` },
        method: "POST",
      });
      if (!res.ok) throw new Error(`Upstash EXPIRE failed: ${res.status}`);
      const data = await res.json();
      return data.result as number;
    },
    async eval(script: string, keys: string[], args: (string | number)[]) {
      const res = await fetch(`${url}/eval/${encodeURIComponent(script)}/${keys.length}`, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ keys, args }),
      });
      if (!res.ok) throw new Error(`Upstash EVAL failed: ${res.status}`);
      const data = await res.json();
      return data.result as number;
    },
  };

  return upstashClient;
}

// Lua script for atomic fixed-window rate limit with TTL
const RATE_LIMIT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return current
`;

async function upstashRateLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const client = getUpstashClient();
  if (!client) throw new Error("Upstash not configured");

  const windowSec = Math.ceil(windowMs / 1000);
  const count = await client.eval(RATE_LIMIT_SCRIPT, [key], [windowSec]);

  if (count > max) {
    // Get TTL to compute retry-after
    const ttlRes = await fetch(
      `${process.env.UPSTASH_REDIS_REST_URL}/ttl/${encodeURIComponent(key)}`,
      { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } }
    );
    const ttlData = await ttlRes.json();
    const ttl = ttlData.result as number;
    return { allowed: false, retryAfterSeconds: Math.max(1, ttl) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

// ──────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────
// Public API — auto-selects best available backend
// ──────────────────────────────────────────────────────────────────────────

export function rateLimit(
  key: string,
  max: number,
  windowMs: number = DEFAULT_WINDOW_MS
): { allowed: boolean; retryAfterSeconds: number } {
  // Synchronous in-memory fallback (default, zero-dep)
  return memRateLimit(key, max, windowMs);
}

// Async version for Redis backends (used when env vars configured)
export async function rateLimitAsync(
  key: string,
  max: number,
  windowMs: number = DEFAULT_WINDOW_MS
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  // Try Upstash first (serverless-native, no connection pooling issues)
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      return await upstashRateLimit(key, max, windowMs);
    } catch (e) {
      console.warn("[rate-limit] Upstash failed, falling back:", e);
    }
  }

  

  // In-memory fallback
  return memRateLimit(key, max, windowMs);
}

// Re-export clientIp helper
export { clientIp } from "./rate-limit-ip.ts";