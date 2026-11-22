import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMAIL_PREF_OPTIONS,
  applyPrefsUpdate,
  parsePrefs,
  serializePrefs,
  wantsEmail,
} from "./notification-prefs.ts";
import { EMAILED_TYPES } from "./email.ts";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
// The test runner rewrites ".ts" to ".js" in compiled tests; map it back.
const read = (rel: string) => readFileSync(join(ROOT, rel.replace(/\.js$/, ".ts")), "utf8");

test("no stored settings means every notice is e-mailed", () => {
  for (const raw of [null, undefined, {}, [], "x", { email_off: "due_soon" }]) {
    const prefs = parsePrefs(raw);
    assert.deepEqual(prefs.emailOff, []);
    assert.equal(wantsEmail(prefs, "due_soon"), true);
  }
});

test("stored opt-outs are read, unknown and required types are ignored", () => {
  const prefs = parsePrefs({ email_off: ["due_soon", "overdue", "made_up", 7, "due_soon"] });
  assert.deepEqual(prefs.emailOff, ["due_soon"]);
  assert.equal(wantsEmail(prefs, "due_soon"), false);
  assert.equal(wantsEmail(prefs, "overdue"), true, "overdue can never be turned off");
});

test("updates turn types off and on", () => {
  const off = applyPrefsUpdate({ emailOff: [] }, { email: { due_soon: false, hold_expiring: false } });
  assert.ok(off.ok);
  if (!off.ok) return;
  assert.deepEqual(off.prefs.emailOff, ["due_soon", "hold_expiring"]);
  const on = applyPrefsUpdate(off.prefs, { email: { due_soon: true } });
  assert.ok(on.ok && on.prefs.emailOff.join() === "hold_expiring");
});

test("updates reject unknown types, non-booleans and turning overdue off", () => {
  assert.equal(applyPrefsUpdate({ emailOff: [] }, { email: { spam: false } }).ok, false);
  assert.equal(applyPrefsUpdate({ emailOff: [] }, { email: { due_soon: "no" } }).ok, false);
  const overdue = applyPrefsUpdate({ emailOff: [] }, { email: { overdue: false } });
  assert.equal(overdue.ok, false);
  assert.equal(applyPrefsUpdate({ emailOff: [] }, { email: { overdue: true } }).ok, true);
  assert.equal(applyPrefsUpdate({ emailOff: [] }, null).ok, false);
});

test("what is stored is always clean", () => {
  assert.deepEqual(serializePrefs({ emailOff: ["overdue", "hold_ready", "x"] }), { email_off: ["hold_ready"] });
});

test("every e-mailed notice type has a setting", () => {
  const types = new Set(EMAIL_PREF_OPTIONS.map((o) => o.type));
  for (const t of EMAILED_TYPES) assert.ok(types.has(t), t);
});

test("the sender honours opt-outs and works before the migration", () => {
  const store = read("src/lib/store.ts");
  const fn = store.slice(store.indexOf("export async function dispatchNotificationEmails"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /wantsEmail\(member\.prefs, row\.type\)/);
  assert.match(body, /isMissingColumn/);
});

test("settings are the caller's own and the card is on My profile", () => {
  const route = read("src/app/api/my-notifications/preferences/route.ts");
  assert.match(route, /getMemberByUser\(user\)/);
  assert.doesNotMatch(route, /memberId["']?\s*:\s*body|body\.memberId/);
  assert.match(read("src/app/(desk)/profile/page.tsx"), /\{patron && <NotificationPrefsCard \/>\}/);
  assert.match(read("supabase/migrations/20261126_notification_prefs.sql"), /notification_prefs jsonb not null default '\{\}'::jsonb/);
});
