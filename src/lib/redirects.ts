/**
 * Redirects that survive a reverse proxy (Render): the app server sees its
 * internal address (e.g. http://localhost:10000) in request.url, so never
 * build a Location from request.url alone.
 *
 * - Route handlers send a RELATIVE Location (`localRedirectInit`); the
 *   browser resolves it against the address it actually used.
 * - proxy.ts must hand Next an absolute URL (its adapter parses Location
 *   without a base), so it uses `publicOrigin`: x-forwarded-host/-proto
 *   from the proxy, then NEXT_PUBLIC_SITE_URL, then the request itself.
 *
 * Pure: no Next imports, so it is tested directly.
 */

type HeaderReader = { get(name: string): string | null };

/** A same-site path ("/login?next=…"). Anything else (absolute, "//host", "/\\host") becomes "/". */
export function safeLocalPath(path: string): string {
  if (typeof path !== "string" || !path.startsWith("/")) return "/";
  if (path.startsWith("//") || path.startsWith("/\\")) return "/";
  if (/[\r\n]/.test(path)) return "/";
  return path;
}

/** Response init for a relative redirect. 303 after a form POST so the browser follows with GET. */
export function localRedirectInit(path: string, status: 302 | 303 | 307 | 308 = 307): ResponseInit {
  return { status, headers: { Location: safeLocalPath(path) } };
}

// host[:port] with no userinfo, path or spaces.
const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i;

function firstValue(value: string | null): string {
  return (value ?? "").split(",")[0].trim();
}

function originFromSiteUrl(siteUrl: string | undefined): string | null {
  if (!siteUrl?.trim()) return null;
  try {
    const url = new URL(siteUrl.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * The origin the visitor used. Proxies may send a list ("a, b"); the first
 * entry is the client-facing one. An invalid forwarded host is ignored.
 */
export function publicOrigin(
  headers: HeaderReader,
  requestUrl: string,
  siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL
): string {
  const host = firstValue(headers.get("x-forwarded-host"));
  if (host && HOST_RE.test(host)) {
    const proto = firstValue(headers.get("x-forwarded-proto")).toLowerCase();
    return `${proto === "http" ? "http" : "https"}://${host.toLowerCase()}`;
  }
  return originFromSiteUrl(siteUrl) ?? new URL(requestUrl).origin;
}
