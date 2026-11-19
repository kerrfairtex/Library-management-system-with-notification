import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fineBlockMessage, parseFineThreshold } from "./fine-block";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
// run-tests.mjs rewrites quoted "*.ts" to ".js"; map back (see deploy-readiness.test.ts).
const read = (rel: string) => readFileSync(join(ROOT, rel.replace(/\.js$/, ".ts")), "utf8");

test("fine threshold is opt-in: unset, blank, junk, zero and negative disable it", () => {
  for (const raw of [undefined, "", "  ", "abc", "0", "-5"]) {
    assert.equal(parseFineThreshold(raw), null, String(raw));
  }
  assert.equal(parseFineThreshold("100"), 100);
  assert.equal(parseFineThreshold("12.5"), 12.5);
});

test("checkout is blocked only at or above the threshold", () => {
  assert.equal(fineBlockMessage(500, null), null, "disabled never blocks");
  assert.equal(fineBlockMessage(99.99, 100), null);
  assert.match(fineBlockMessage(100, 100) ?? "", /Checkout blocked.*₱100\.00/);
  assert.match(fineBlockMessage(250, 100) ?? "", /₱250\.00/);
  assert.equal(fineBlockMessage(Number.NaN, 100), null);
});

test("checkout route enforces the fine block before creating the loan", () => {
  const route = read("src/app/api/loans/route.ts");
  const guard = route.indexOf("fineBlockMessage(");
  const checkout = route.indexOf("await checkoutBook(");
  assert.ok(guard > 0 && guard < checkout, "fine check must run before checkoutBook");
  assert.match(route, /status: 409/);
});

test("daily sweep also expires ready holds past their pickup window", () => {
  const cron = read("src/app/api/cron/refresh-loans/route.ts");
  assert.match(cron, /await expireStaleHolds\(\)/);
  const store = read("src/lib/store.ts");
  const fn = store.slice(store.indexOf("export async function expireStaleHolds"));
  assert.match(fn, /\.eq\("status", "ready"\)/);
  assert.match(fn, /\.lt\("expires_at"/);
  assert.match(fn, /status: "expired"/);
});
