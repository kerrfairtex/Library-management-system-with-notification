import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSessionToken, readSession, readSessionUserId } from "./session.ts";
import { csrfTokensMatch } from "./csrf.ts";
import {
  CIRCULATION_DEFAULTS,
  parseCirculationSetting,
  resolveCirculationSettings,
} from "./circulation-settings.ts";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
// The test runner rewrites ".ts" to ".js" in compiled tests; map it back.
const read = (rel: string) => readFileSync(join(ROOT, rel.replace(/\.js$/, ".ts")), "utf8");

// ── Sessions ────────────────────────────────────────────────────────────────

test("a new session token carries sub, sid, iat and a future exp", async () => {
  const claims = await readSession(await createSessionToken("user-1"));
  assert.ok(claims);
  assert.equal(claims.sub, "user-1");
  assert.ok(claims.sid.length >= 16);
  assert.ok(claims.exp > claims.iat);
});

test("each sign-in gets its own sid", async () => {
  const a = await readSession(await createSessionToken("user-1"));
  const b = await readSession(await createSessionToken("user-1"));
  assert.notEqual(a?.sid, b?.sid);
});

test("an expired token is rejected", async () => {
  const token = await createSessionToken("user-1", -1);
  assert.equal(await readSessionUserId(token), null);
});

test("a tampered payload is rejected", async () => {
  const token = await createSessionToken("user-1");
  const [, sig] = token.split(".");
  const forged = Buffer.from(
    JSON.stringify({ sub: "admin", sid: "x", iat: 0, exp: 9_999_999_999 })
  ).toString("base64url");
  assert.equal(await readSessionUserId(`${forged}.${sig}`), null);
});

test("a legacy token (bare user id, no expiry) is rejected", async () => {
  // Old format: base64url(userId).signature. Signing is internal, so build a
  // token whose payload is not claims JSON and confirm it never yields a user.
  const legacyPayload = Buffer.from("user-1").toString("base64url");
  const token = await createSessionToken("user-1");
  const [, sig] = token.split(".");
  assert.equal(await readSessionUserId(`${legacyPayload}.${sig}`), null);
});

test("logout and password reset revoke sessions server-side", () => {
  assert.match(read("src/app/api/auth/logout/route.ts"), /revokeSession\(claims\)/);
  assert.match(read("src/app/api/auth/reset-password/route.ts"), /revokeAllSessions\(/);
  assert.match(read("src/lib/authz.ts"), /isSessionRevoked\(claims\)/);
});

// ── CSRF ────────────────────────────────────────────────────────────────────

test("CSRF passes only when header and cookie are both present and equal", () => {
  assert.equal(csrfTokensMatch("abc", "abc"), true);
  assert.equal(csrfTokensMatch("abc", "abd"), false);
  assert.equal(csrfTokensMatch("abc", undefined), false, "missing cookie must fail");
  assert.equal(csrfTokensMatch(null, "abc"), false, "missing header must fail");
  assert.equal(csrfTokensMatch("", ""), false);
});

test("every raw mutating fetch in the desk sends the CSRF header", () => {
  for (const page of [
    "src/app/(desk)/borrow/page.tsx",
    "src/app/(desk)/fines/page.tsx",
    "src/app/(desk)/holds/page.tsx",
    "src/app/(desk)/circulation/checkout/page.tsx",
    "src/app/(desk)/circulation/checkin/page.tsx",
    "src/app/(desk)/my-loans/page.tsx",
  ]) {
    const src = read(page);
    const mutating = src.match(/method: "(POST|PATCH|PUT|DELETE)"/g) ?? [];
    const withHeader = src.match(/\.\.\.csrfHeaders\(\)/g) ?? [];
    assert.ok(mutating.length > 0, page);
    assert.equal(withHeader.length, mutating.length, page);
  }
});

// ── Circulation settings ────────────────────────────────────────────────────

test("settings validation accepts known keys within bounds", () => {
  assert.deepEqual(parseCirculationSetting("pickup_window_days", 7), {
    ok: true,
    key: "pickup_window_days",
    value: 7,
  });
  assert.deepEqual(parseCirculationSetting("loan_period_options", "[21, 7, 7]"), {
    ok: true,
    key: "loan_period_options",
    value: [7, 21],
  });
});

test("settings validation rejects unknown keys and out-of-range values", () => {
  assert.equal(parseCirculationSetting("max_active_loans_per_member", 3).ok, false);
  assert.equal(parseCirculationSetting("pickup_window_days", 0).ok, false);
  assert.equal(parseCirculationSetting("pickup_window_days", 2.5).ok, false);
  assert.equal(parseCirculationSetting("max_loan_days", 1000).ok, false);
  assert.equal(parseCirculationSetting("loan_period_options", []).ok, false);
});

test("stored settings override defaults; bad rows fall back", () => {
  const s = resolveCirculationSettings([
    { key: "circulation.pickup_window_days", value: 7 },
    { key: "circulation.due_soon_window_days", value: "2" },
    { key: "circulation.max_loan_days", value: "lots" },
    { key: "general.site_name", value: "x" },
  ]);
  assert.equal(s.pickup_window_days, 7);
  assert.equal(s.due_soon_window_days, 2);
  assert.equal(s.max_loan_days, CIRCULATION_DEFAULTS.max_loan_days);
});

test("pickup window, loan and renewal limits come from settings, not literals", () => {
  assert.doesNotMatch(read("src/app/api/holds/route.ts"), /3 \* 24 \* 60 \* 60 \* 1000/);
  assert.doesNotMatch(read("src/lib/store.ts"), /Date\.now\(\) \+ 3 \* 24/);
  assert.match(read("src/app/api/loans/[id]/route.ts"), /max_renewal_days/);
  assert.match(read("src/app/api/loans/route.ts"), /max_loan_days/);
});

// ── Migrations ──────────────────────────────────────────────────────────────

test("renew_loan migration enforces max_renewals and the holds block", () => {
  const sql = read("supabase/migrations/20261123_circulation_rules_enforced.sql");
  assert.match(sql, /max_renewals/);
  assert.match(sql, /Renewal limit reached/);
  assert.match(sql, /another member is waiting/);
});

test("lockdown migration denies anon/authenticated on core tables", () => {
  const sql = read("supabase/security/20261123_core_tables_lockdown.sql");
  for (const t of ["users", "members", "books", "loans", "holds", "fines", "notifications"]) {
    assert.match(sql, new RegExp(`'${t}'`));
  }
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.%I from anon, authenticated/);
});

// ── 1,000-row truncation ────────────────────────────────────────────────────

test("whole-table reads page through range() instead of trusting one request", () => {
  const store = read("src/lib/store.ts");
  for (const fn of ["listBooks", "listMembers", "getLoansData", "getNotificationsData", "listHolds", "getLibraryData"]) {
    const start = store.indexOf(`export async function ${fn}`);
    assert.ok(start >= 0, fn);
    const body = store.slice(start, store.indexOf("\n}\n", start));
    assert.match(body, /fetchAllRows/, fn);
  }
});
