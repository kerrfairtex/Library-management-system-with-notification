/** Pure CORS policy for the public shelf-availability feed. */
export function corsAllowed(rawOrigin: string | undefined, requestOrigin: string | null): {
  configured: boolean;
  allowed: boolean;
  responseOrigin: string;
} {
  const allowed = (rawOrigin ?? "").trim().replace(/\/$/, "");
  const configured = allowed.length > 0 && allowed !== "*";
  const request = (requestOrigin ?? "").trim().replace(/\/$/, "");
  const ok = configured && (!request || request.toLowerCase() === allowed.toLowerCase());
  return { configured, allowed: ok, responseOrigin: ok ? allowed : "null" };
}
