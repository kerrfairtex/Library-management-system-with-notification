import { db, supabase } from "./supabase";
import { SESSION_TTL_SECONDS, type SessionClaims } from "./session";

/**
 * Server-side session revocation, backed by public.session_revocations
 * (supabase/security/20261123_core_tables_lockdown.sql).
 *
 * The signed token is still the source of identity; this table only lists
 * tokens that must stop working before their exp: a session that logged out,
 * or every session of a user whose password was reset.
 *
 * Until that migration is applied the table does not exist. Then revocation
 * is skipped with a warning (tokens still expire after SESSION_TTL_SECONDS),
 * so deploying this code first never locks anyone out.
 */

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);
let warnedMissing = false;

function tableMissing(error: { code?: string } | null): boolean {
  if (!error || !error.code || !MISSING_TABLE_CODES.has(error.code)) return false;
  if (!warnedMissing) {
    warnedMissing = true;
    console.warn(
      "session_revocations table not found: logout and password-reset revocation are off " +
        "until supabase/security/20261123_core_tables_lockdown.sql is applied."
    );
  }
  return true;
}

function iso(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

/** True when this session was logged out or predates a revoke-all. */
export async function isSessionRevoked(claims: SessionClaims): Promise<boolean> {
  const { data, error } = await db(supabase)
    .from("session_revocations")
    .select("id")
    .eq("user_id", claims.sub)
    .or(`sid.eq.${claims.sid},not_before.gt.${iso(claims.iat)}`)
    .limit(1);
  if (error) {
    if (tableMissing(error)) return false;
    // Fail closed: if revocation cannot be checked, do not trust the session.
    console.error("Session revocation check failed:", error.message);
    return true;
  }
  return (data ?? []).length > 0;
}

/** Ends one session (logout). */
export async function revokeSession(claims: SessionClaims): Promise<void> {
  const { error } = await db(supabase).from("session_revocations").insert({
    user_id: claims.sub,
    sid: claims.sid,
    expires_at: iso(claims.exp),
  });
  if (error && !tableMissing(error)) {
    console.error("Session revoke failed:", error.message);
  }
}

/** Ends every session the user has open right now (password reset). */
export async function revokeAllSessions(userId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const { error } = await db(supabase).from("session_revocations").insert({
    user_id: userId,
    // Tokens issued in this same second compare iat == not_before and stay
    // valid; strictly earlier ones are revoked.
    not_before: iso(now),
    expires_at: iso(now + SESSION_TTL_SECONDS),
  });
  if (error && !tableMissing(error)) {
    console.error("Revoke-all sessions failed:", error.message);
  }
}
