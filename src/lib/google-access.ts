/**
 * Decides who may sign in with Google.
 *
 * Google sign-in used to create a librarian account for any address that
 * completed the OAuth handshake, which is open staff registration. Now a new
 * account is only created for an address on an allowlist; everyone else must
 * already have a row in `users`, which a librarian creates deliberately.
 *
 * Configure with either or both:
 *   GOOGLE_ALLOWED_DOMAINS=trac.edu.ph,students.trac.edu.ph
 *   GOOGLE_ALLOWED_EMAILS=head.librarian@gmail.com
 *
 * With neither set, nobody is auto-provisioned.
 */

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function mayProvisionGoogleAccount(email: string): boolean {
  const address = email.trim().toLowerCase();
  const domain = address.split("@")[1];
  if (!domain) return false;

  if (parseList(process.env.GOOGLE_ALLOWED_EMAILS).includes(address)) {
    return true;
  }

  return parseList(process.env.GOOGLE_ALLOWED_DOMAINS).some(
    (allowed) => domain === allowed || domain.endsWith(`.${allowed}`)
  );
}

export function googleAccessDeniedMessage(email: string): string {
  const configured =
    parseList(process.env.GOOGLE_ALLOWED_DOMAINS).length > 0 ||
    parseList(process.env.GOOGLE_ALLOWED_EMAILS).length > 0;

  return configured
    ? `${email} isn't approved for library desk access. Ask a librarian to add you.`
    : `${email} has no library desk account. A librarian must create one before you can sign in with Google.`;
}
