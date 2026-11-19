import test from "node:test";
import assert from "node:assert/strict";
import { corsAllowed } from "../../../lib/cors-policy.ts";

test("CORS fails closed when no origin is configured or wildcard is set", () => {
  for (const raw of [undefined, "", "   ", "*"]) {
    const p = corsAllowed(raw, "https://bookshelf.example.test");
    assert.equal(p.configured, false);
    assert.equal(p.allowed, false);
    assert.equal(p.responseOrigin, "null");
  }
});

test("configured origin is allowed; unconfigured origins are rejected", () => {
  const good = corsAllowed("https://bookshelf.example.test/", "https://bookshelf.example.test");
  assert.equal(good.configured, true);
  assert.equal(good.allowed, true);
  assert.equal(good.responseOrigin, "https://bookshelf.example.test");
  const bad = corsAllowed("https://bookshelf.example.test", "https://evil.example.test");
  assert.equal(bad.allowed, false);
  assert.equal(bad.responseOrigin, "null");
});

test("no-origin (non-browser) request passes when configured", () => {
  const p = corsAllowed("https://bookshelf.example.test", null);
  assert.equal(p.allowed, true);
  assert.equal(p.responseOrigin, "https://bookshelf.example.test");
});
