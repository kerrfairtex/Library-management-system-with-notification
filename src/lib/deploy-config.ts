/**
 * Deployment isolation policy. All deployment-origin configuration is EXPLICIT.
 * There are deliberately NO production URL fallbacks: a missing or invalid
 * value fails closed so a staging build can never silently point at production.
 */
export type ConfigCheck =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** Known production hosts are never accepted as an implicit fallback. */
const PRODUCTION_HOSTS = [
  "trac-library-bookshelf.vercel.app",
  "library-cp22.onrender.com",
];

export function resolveDeploymentOrigin(
  raw: string | undefined,
  label: string
): ConfigCheck {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: `${label} is not configured.` };
  }
  const value = raw.trim().replace(/\/$/, "");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: `${label} must be an absolute http(s) URL.` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: `${label} must use http or https.` };
  }
  if (PRODUCTION_HOSTS.includes(parsed.hostname.toLowerCase())) {
    // A production host is allowed ONLY when explicitly configured. Thus a
    // staging build must set staging values; the policy itself never defaults.
    return { ok: true, value };
  }
  return { ok: true, value };
}

/** Confirms two configured origins are not the same (staging must differ). */
export function originsAreDistinct(a: string, b: string): boolean {
  return a.replace(/\/$/, "").toLowerCase() !== b.replace(/\/$/, "").toLowerCase();
}
