// Double-submit check: the header (set by our own JS, which can read the
// cookie) must be present AND equal to the cookie. A cross-site form or
// fetch can make the browser send the cookie but cannot read it to set the
// header, and a missing cookie never passes.
export function csrfTokensMatch(
  header: string | null | undefined,
  cookie: string | null | undefined
): boolean {
  if (!header || !cookie) return false;
  if (header.length !== cookie.length) return false;
  let mismatch = 0;
  for (let i = 0; i < header.length; i += 1) {
    mismatch |= header.charCodeAt(i) ^ cookie.charCodeAt(i);
  }
  return mismatch === 0;
}
