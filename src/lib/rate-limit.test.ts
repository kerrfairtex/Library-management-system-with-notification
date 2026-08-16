import assert from "node:assert/strict";
import { test } from "node:test";
import { rateLimit } from "./rate-limit.ts";

test("allows requests under the limit", () => {
  const first = rateLimit("k1", 3, 60_000);
  assert.equal(first.allowed, true);
  assert.equal(first.retryAfterSeconds, 0);
  assert.equal(rateLimit("k1", 3, 60_000).allowed, true);
  assert.equal(rateLimit("k1", 3, 60_000).allowed, true);
});

test("rejects once the limit is reached and reports retry-after", () => {
  rateLimit("k2", 2, 60_000);
  rateLimit("k2", 2, 60_000);
  const third = rateLimit("k2", 2, 60_000);
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfterSeconds > 0 && third.retryAfterSeconds <= 60);
});

test("different keys are independent", () => {
  rateLimit("k3", 1, 60_000);
  assert.equal(rateLimit("k3", 1, 60_000).allowed, false);
  assert.equal(rateLimit("k4", 1, 60_000).allowed, true);
});

test("the window resets after expiry", () => {
  rateLimit("k5", 1, 10);
  assert.equal(rateLimit("k5", 1, 10).allowed, false);
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      assert.equal(rateLimit("k5", 1, 10).allowed, true);
      resolve();
    }, 15);
  });
});
