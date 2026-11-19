import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("verify-loans fails closed without a direct URL and never prints one", () => {
  const sql = readFileSync(
    join(process.env.TRAC_PROJECT_ROOT ?? process.cwd(), "scripts", "verify-loan-guards.sh"),
    "utf8"
  );
  assert.match(sql, /POSTGRES_URL_NON_POOLING/);
  assert.match(sql, /DIRECT_URL/);
  assert.match(sql, /DATABASE_URL/);
  assert.match(sql, /exit 1/);
  // The script must not echo the resolved URL.
  assert.equal(/echo\s+"?\$PGURL/.test(sql), false);
});
