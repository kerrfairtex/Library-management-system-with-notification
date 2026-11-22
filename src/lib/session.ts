// The development fallback is public in this repo, so anyone could forge a
// session cookie with it. Refuse to start in production without a real secret
// rather than silently accepting forged sessions.
function resolveSessionSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` and " +
        "add it to your deployment environment before serving traffic."
    );
  }
  return "trac-dev-secret-change-me";
}

export const SESSION_COOKIE = "trac_session";

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 1) {
    binary += String.fromCharCode(view[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}

async function getKey() {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(resolveSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function sign(payload: string): Promise<string> {
  const key = await getKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toBase64Url(signature);
}

/** How long a sign-in lasts. The cookie maxAge and the token's exp agree. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type SessionClaims = {
  /** users.id */
  sub: string;
  /** Random per-sign-in id, so one session can be revoked on logout. */
  sid: string;
  /** Issued at, seconds since epoch. */
  iat: number;
  /** Expires at, seconds since epoch. Checked on every read. */
  exp: number;
};

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function randomSid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function createSessionToken(
  userId: string,
  ttlSeconds = SESSION_TTL_SECONDS
): Promise<string> {
  const iat = nowSeconds();
  const claims: SessionClaims = { sub: userId, sid: randomSid(), iat, exp: iat + ttlSeconds };
  const payload = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

/**
 * Verifies the signature and expiry and returns the claims. Tokens from
 * before claims existed (payload = bare user id, no exp) are rejected, so
 * those sessions end and the user signs in once more.
 */
export async function readSession(
  token: string | undefined | null
): Promise<SessionClaims | null> {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = await sign(payload);
  if (signature.length !== expected.length) return null;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i += 1) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (mismatch !== 0) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(fromBase64Url(payload), (c) => c.charCodeAt(0))
      )
    );
  } catch {
    return null;
  }
  if (!claims || typeof claims !== "object") return null;
  const { sub, sid, iat, exp } = claims as Partial<SessionClaims>;
  if (typeof sub !== "string" || !sub) return null;
  if (typeof sid !== "string" || !sid) return null;
  if (typeof iat !== "number" || typeof exp !== "number") return null;
  if (exp <= nowSeconds()) return null;
  return { sub, sid, iat, exp };
}

export async function readSessionUserId(
  token: string | undefined | null
): Promise<string | null> {
  return (await readSession(token))?.sub ?? null;
}

export function sessionCookieOptions(maxAgeSeconds = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "none" as const,  // Allow cross-origin cookie for Vercel → Render
    secure: true,               // Required for SameSite=none
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
