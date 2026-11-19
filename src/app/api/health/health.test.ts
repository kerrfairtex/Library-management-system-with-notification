import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "./route.ts";

test("health endpoint returns minimal non-sensitive status", async () => {
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { status: "ok" });
  const text = JSON.stringify(body).toLowerCase();
  for (const term of ["secret", "token", "supabase", "database", "url", "stack"]) {
    assert.equal(text.includes(term), false, `must not expose ${term}`);
  }
  assert.equal(res.headers.get("cache-control"), "no-store");
});
