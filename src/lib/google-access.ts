/**
 * Decides who may get a new desk account via Google sign-up.
 *
 * Completing the Google handshake proves identity. By default, anyone who
 * finishes it may sign up as a student. Optionally restrict that with an
 * allowlist, or turn open sign-up off so only pre-created accounts work.
 *
 *   GOOGLE_OPEN_SIGNUP=true          (default) allow first-time Google sign-up
 *   GOOGLE_OPEN_SIGNUP=false         require an existing users row
 *   GOOGLE_ALLOWED_DOMAINS=…         when set, only these domains may sign up
 *   GOOGLE_ALLOWED_EMAILS=…          when set, only these addresses may sign up
 *
 * If either allowlist variable is set, it wins over open sign-up.
 */

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

function openSignupEnabled(): boolean {
  const raw = (process.env.GOOGLE_OPEN_SIGNUP ?? "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off" && raw !== "no";
}

export function mayProvisionGoogleAccount(email: string): boolean {
  const address = email.trim().toLowerCase();
  const domain = address.split("@")[1];
  if (!domain) return false;

  const emails = parseList(process.env.GOOGLE_ALLOWED_EMAILS);
  const domains = parseList(process.env.GOOGLE_ALLOWED_DOMAINS);
  const allowlistConfigured = emails.length > 0 || domains.length > 0;

  if (allowlistConfigured) {
    if (emails.includes(address)) return true;
    return domains.some(
      (allowed) => domain === allowed || domain.endsWith(`.${allowed}`)
    );
  }

  return openSignupEnabled();
}

export function googleAccessDeniedMessage(email: string): string {
  const allowlistConfigured =
    parseList(process.env.GOOGLE_ALLOWED_DOMAINS).length > 0 ||
    parseList(process.env.GOOGLE_ALLOWED_EMAILS).length > 0;

  if (allowlistConfigured) {
    return `${email} isn't approved for library access. Ask a librarian to add you.`;
  }

  return `${email} has no library account. Ask a librarian to create one, or enable Google sign-up.`;
}
