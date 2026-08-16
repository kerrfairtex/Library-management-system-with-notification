/**
 * Minimal in-memory fixed-window rate limiter. No dependencies.
 *
 * Deliberate limitation (documented, not hidden): the counters live in
 * process memory, so on a serverless platform (Vercel) each lambda instance
 * keeps its own window. This stops single-instance brute force, scripted
 * runs, and most abuse; for a hard guarantee across instances, replace with
 * an external store (Vercel KV / Upstash / Cloudflare Rate Limiting) behind
 * the same interface.
 */

type Entry = { count: number; resetAt: number };

const buckets = new Map<string, Entry>();

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

/** Keeps the map from growing forever under many distinct keys. */
function prune(now: number): void {
  if (buckets.size < 10_000) return;
  for (const [key, entry] of buckets) {
    if (now >= entry.resetAt) buckets.delete(key);
  }
}

export function rateLimit(
  key: string,
  max: number,
  windowMs: number = DEFAULT_WINDOW_MS
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  prune(now);

  const entry = buckets.get(key);
  if (!entry || now >= entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
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

/** Best-effort client identifier from proxy headers; never trusted, only throttled. */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
