/**
 * Pure authorization/isolation policy for the loan-refresh cron endpoint.
 * The endpoint itself delegates to this function; tests exercise this exact
 * production logic.
 */
export function cronPolicy(args: {
  enabled: string | undefined;
  scheduled: boolean;
  secret: string | undefined;
  auth: string | null;
}): 403 | 401 | 503 | null {
  if (args.enabled !== "true") return 403; // fail-closed deployment opt-in
  if (!args.secret) return 503;
  if (args.auth !== `Bearer ${args.secret}`) return 401;
  return null;
}
