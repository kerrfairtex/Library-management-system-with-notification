import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { holdView, lendableCopies, queuePositions, type QueueHold } from "./hold-queue.ts";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
// The test runner rewrites ".ts" to ".js" in compiled tests; map it back.
const read = (rel: string) => readFileSync(join(ROOT, rel.replace(/\.js$/, ".ts")), "utf8");

const h = (id: string, priority: number, placed: string, extra: Partial<QueueHold> = {}): QueueHold => ({
  id,
  book_id: "b1",
  member_id: `m-${id}`,
  status: "pending",
  priority,
  placed_at: placed,
  ...extra,
});

test("place in line follows priority, then placed_at", () => {
  const p = queuePositions([
    h("c", 2, "2026-11-03"),
    h("a", 1, "2026-11-05"),
    h("b", 2, "2026-11-01"),
  ]);
  assert.deepEqual(p, { a: 1, b: 2, c: 3 });
});

test("positions are live: a filled hold ahead no longer counts", () => {
  const p = queuePositions([h("a", 1, "2026-11-01", { status: "ready" }), h("b", 2, "2026-11-02")]);
  assert.deepEqual(p, { b: 1 });
});

test("a paused hold keeps its place but does not push others back", () => {
  const p = queuePositions([
    h("a", 1, "2026-11-01", { suspended_at: "2026-11-10" }),
    h("b", 2, "2026-11-02"),
    h("c", 3, "2026-11-03"),
  ]);
  assert.deepEqual(p, { a: 1, b: 1, c: 2 });
});

test("titles are queued separately", () => {
  const p = queuePositions([h("a", 1, "2026-11-01"), h("x", 1, "2026-11-01", { book_id: "b2" })]);
  assert.equal(p.a, 1);
  assert.equal(p.x, 1);
});

test("copies set aside for ready holds are not lendable to others", () => {
  assert.equal(lendableCopies({ availableCopies: 2, readyHoldsForOthers: 2 }), 0);
  assert.equal(lendableCopies({ availableCopies: 3, readyHoldsForOthers: 1 }), 2);
  assert.equal(lendableCopies({ availableCopies: 0, readyHoldsForOthers: 1 }), 0);
});

test("what My loans shows for each hold state", () => {
  const fmt = () => "Dec 1, 2026";
  const ready = holdView({ status: "ready", expires_at: "2026-12-01" }, undefined, fmt);
  assert.equal(ready.label, "Ready — pick up by Dec 1, 2026");
  assert.equal(ready.canPause, false);
  assert.equal(ready.canCancel, true);

  const waiting = holdView({ status: "pending" }, 2, fmt);
  assert.equal(waiting.label, "#2 in line");
  assert.equal(waiting.canPause, true);

  const paused = holdView({ status: "pending", suspended_at: "x" }, 1, fmt);
  assert.equal(paused.label, "Paused · keeps #1 in line");
  assert.equal(paused.canResume, true);
  assert.equal(paused.canPause, false);
});

test("trap_holds locks the title, skips paused holds and notifies the member", () => {
  const sql = read("supabase/migrations/20261124_hold_queue.sql");
  assert.match(sql, /from books where id = p_book_id\s+for update/);
  assert.match(sql, /suspended_at is null/);
  assert.match(sql, /order by h\.priority, h\.placed_at, h\.id/);
  assert.match(sql, /'hold_ready'/);
  assert.match(sql, /recipient_member_id/);
  assert.match(sql, /after insert on public\.loans/);
});

test("the queue runs after returns, cancels, expiries, new holds and nightly", () => {
  assert.match(read("src/app/api/loans/[id]/route.ts"), /trapHoldsQuietly\(loan\.bookId\)/);
  const holds = read("src/app/api/holds/route.ts");
  assert.equal((holds.match(/trapHoldsQuietly\(/g) ?? []).length, 3, "patron cancel, staff cancel, new hold");
  const store = read("src/lib/store.ts");
  const expire = store.slice(store.indexOf("export async function expireStaleHolds"));
  assert.match(expire.slice(0, expire.indexOf("\n}\n")), /trapHoldsQuietly/);
  assert.match(read("src/app/api/cron/refresh-loans/route.ts"), /trapAllHolds\(\)/);
});

test("staff checkout refuses a copy set aside for someone else's ready hold", () => {
  const route = read("src/app/api/loans/route.ts");
  assert.match(route, /countReadyHoldsForOthers/);
  assert.match(route, /reservedCopyMessage/);
});

test("patrons can pause and resume only their own waiting holds", () => {
  const store = read("src/lib/store.ts");
  const fn = store.slice(store.indexOf("export async function setHoldPaused"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /\.eq\("member_id", memberId\)/);
  assert.match(body, /\.eq\("status", "pending"\)/);
});
