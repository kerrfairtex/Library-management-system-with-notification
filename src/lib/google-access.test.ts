import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mayProvisionGoogleAccount } from "./google-access.ts";

function configure(env: { domains?: string; emails?: string }) {
  if (env.domains === undefined) delete process.env.GOOGLE_ALLOWED_DOMAINS;
  else process.env.GOOGLE_ALLOWED_DOMAINS = env.domains;

  if (env.emails === undefined) delete process.env.GOOGLE_ALLOWED_EMAILS;
  else process.env.GOOGLE_ALLOWED_EMAILS = env.emails;
}

afterEach(() => configure({}));

test("nobody is provisioned when no allowlist is configured", () => {
  configure({});
  assert.equal(mayProvisionGoogleAccount("stranger@gmail.com"), false);
  assert.equal(mayProvisionGoogleAccount("staff@trac.edu.ph"), false);
});

test("an allowed domain is provisioned", () => {
  configure({ domains: "trac.edu.ph" });
  assert.equal(mayProvisionGoogleAccount("librarian@trac.edu.ph"), true);
});

test("an outside domain is refused even when a domain is allowed", () => {
  configure({ domains: "trac.edu.ph" });
  assert.equal(mayProvisionGoogleAccount("stranger@gmail.com"), false);
});

test("subdomains of an allowed domain are accepted", () => {
  configure({ domains: "trac.edu.ph" });
  assert.equal(mayProvisionGoogleAccount("amina@students.trac.edu.ph"), true);
});

test("a lookalike domain is refused", () => {
  configure({ domains: "trac.edu.ph" });
  assert.equal(mayProvisionGoogleAccount("attacker@nottrac.edu.ph"), false);
  assert.equal(mayProvisionGoogleAccount("attacker@trac.edu.ph.evil.com"), false);
});

test("a single address can be allowed without its whole domain", () => {
  configure({ emails: "head.librarian@gmail.com" });
  assert.equal(mayProvisionGoogleAccount("head.librarian@gmail.com"), true);
  assert.equal(mayProvisionGoogleAccount("someone.else@gmail.com"), false);
});

test("matching ignores case and surrounding whitespace", () => {
  configure({ domains: " TRAC.EDU.PH , other.org ", emails: " Head@Example.COM " });
  assert.equal(mayProvisionGoogleAccount("Staff@Trac.Edu.PH"), true);
  assert.equal(mayProvisionGoogleAccount("x@other.org"), true);
  assert.equal(mayProvisionGoogleAccount("HEAD@example.com"), true);
});

test("a leading @ on a configured domain is tolerated", () => {
  configure({ domains: "@trac.edu.ph" });
  assert.equal(mayProvisionGoogleAccount("staff@trac.edu.ph"), true);
});

test("malformed addresses are refused", () => {
  configure({ domains: "trac.edu.ph" });
  assert.equal(mayProvisionGoogleAccount("no-at-sign"), false);
  assert.equal(mayProvisionGoogleAccount(""), false);
});
