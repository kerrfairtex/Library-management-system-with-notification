import test from "node:test";
import assert from "node:assert/strict";
import { resolveDeploymentOrigin } from "./deploy-config.ts";
import { cronPolicy } from "./cron-policy.ts";

test("missing shelf URL fails closed — no production fallback", () => {
  for (const raw of [undefined, "", "   "]) {
    const r = resolveDeploymentOrigin(raw, "NEXT_PUBLIC_SHELF_ORIGIN");
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /not configured/);
    assert.equal(r.ok ? "" : r.error.includes("trac-library-bookshelf.vercel.app"), false);
  }
});

test("staging origin resolves to itself, never to a production URL", () => {
  const r = resolveDeploymentOrigin("https://trac-staging.example.test/", "NEXT_PUBLIC_SHELF_ORIGIN");
  assert.equal(r.ok, true);
  assert.equal(r.ok ? r.value : "", "https://trac-staging.example.test");
});

test("invalid or non-http origins are rejected without echoing values", () => {
  for (const raw of ["not a url", "ftp://example.test", "javascript:alert(1)"]) {
    const r = resolveDeploymentOrigin(raw, "LABEL");
    assert.equal(r.ok, false);
    assert.equal(r.ok ? "" : r.error.includes(raw), false);
  }
});

test("explicitly configured production origin is preserved", () => {
  const r = resolveDeploymentOrigin("https://trac-library-bookshelf.vercel.app", "NEXT_PUBLIC_SHELF_ORIGIN");
  assert.equal(r.ok, true);
  assert.equal(r.ok ? r.value : "", "https://trac-library-bookshelf.vercel.app");
});

test("scheduled cron is disabled unless explicitly enabled", () => {
  const blocked = cronPolicy({ enabled: undefined, scheduled: true, secret: "s", auth: "Bearer s" });
  assert.equal(blocked, 403);
  const manualBlocked = cronPolicy({ enabled: undefined, scheduled: false, secret: "s", auth: "Bearer s" });
  assert.equal(manualBlocked, 403);
  const enabled = cronPolicy({ enabled: "true", scheduled: true, secret: "s", auth: "Bearer s" });
  assert.equal(enabled, null);
  const noSecret = cronPolicy({ enabled: "true", scheduled: true, secret: undefined, auth: "Bearer s" });
  assert.equal(noSecret, 503);
  const badAuth = cronPolicy({ enabled: "true", scheduled: true, secret: "s", auth: "Bearer wrong" });
  assert.equal(badAuth, 401);
});
