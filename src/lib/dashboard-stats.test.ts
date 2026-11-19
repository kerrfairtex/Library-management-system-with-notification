import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  calendarDaysUntil,
  currentlyBorrowed,
  dueLabel,
  finesOwed,
  holdCounts,
  isSameLocalDay,
  loanLimitRemaining,
  peso,
  recentActivity,
  type MyLoanRow,
} from "./dashboard-stats.ts";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
// run-tests.mjs rewrites quoted "*.ts" to ".js"; map back.
const read = (rel: string) => readFileSync(join(ROOT, rel.replace(/\.js$/, ".ts")), "utf8");

// Local-time noon keeps day arithmetic stable in any timezone.
const NOW = new Date(2026, 10, 19, 12, 0, 0);
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour, 0, 0).toISOString();

const loan = (id: string, o: Partial<MyLoanRow>): MyLoanRow => ({
  id, borrowed_at: at(10), due_at: at(24), returned_at: null, status: "active",
  books: { title: `Book ${id}`, author: "A" }, ...o,
});

// ── Patron ──────────────────────────────────────────────────────────────────
test("currentlyBorrowed lists open loans soonest-due first and flags overdue", () => {
  const rows = [
    loan("later", { due_at: at(25) }),
    loan("late", { due_at: at(16), status: "active" }), // sweep hasn't stamped it yet
    loan("back", { returned_at: at(18), status: "returned" }),
    loan("soon", { due_at: at(20) }),
  ];
  const out = currentlyBorrowed(rows, NOW);
  assert.deepEqual(out.map((b) => b.id), ["late", "soon", "later"]);
  assert.equal(out[0].overdue, true);
  assert.equal(out[0].daysLeft, -3);
  assert.equal(out[1].overdue, false);
  assert.equal(out[1].daysLeft, 1);
});

test("due labels read naturally", () => {
  assert.equal(dueLabel(-3, true), "3 days overdue");
  assert.equal(dueLabel(-1, true), "1 day overdue");
  assert.equal(dueLabel(0, true), "Overdue today");
  assert.equal(dueLabel(0, false), "Due today");
  assert.equal(dueLabel(1, false), "Due tomorrow");
  assert.equal(dueLabel(5, false), "5 days left");
});

test("finesOwed sums outstanding amounts from strings or numbers, ignoring negatives", () => {
  assert.equal(finesOwed([{ amount_outstanding: "25.50" }, { amount_outstanding: 10 }, { amount_outstanding: -4 }]), 35.5);
  assert.equal(finesOwed([{ amountOutstanding: 0.1 }, { amountOutstanding: 0.2 }]), 0.3);
  assert.equal(finesOwed([]), 0);
});

test("loan limit remaining uses the rule, defaults to 3, never goes negative", () => {
  assert.equal(loanLimitRemaining(5, 2), 3);
  assert.equal(loanLimitRemaining(null, 1), 2);
  assert.equal(loanLimitRemaining(2, 4), 0);
});

test("holdCounts separates waiting from ready for pickup", () => {
  assert.deepEqual(holdCounts([{ status: "pending" }, { status: "ready" }, { status: "pending" }]), { waiting: 2, ready: 1 });
});

test("recentActivity merges borrows, returns and holds newest first", () => {
  const items = recentActivity(
    [loan("1", { borrowed_at: at(10), returned_at: at(15), status: "returned" })],
    [{ id: "h", status: "pending", placed_at: at(12), books: { title: "Held" } }],
    5
  );
  assert.deepEqual(items.map((i) => i.verb), ["Returned", "Placed a hold on", "Borrowed"]);
  assert.equal(recentActivity([loan("x", {}), loan("y", {})], [], 1).length, 1);
});

test("day helpers count calendar days", () => {
  assert.equal(isSameLocalDay(at(19, 1), NOW), true);
  assert.equal(isSameLocalDay(at(18, 23), NOW), false);
  assert.equal(isSameLocalDay(null, NOW), false);
  assert.equal(calendarDaysUntil(at(19, 23), NOW), 0);
  assert.equal(peso(1234.5), "₱1,234.50");
});

test("my-loans returns the loan limit for the caller's own member type only", () => {
  const route = read("src/app/api/my-loans/route.ts");
  assert.match(route, /getMemberByUser\(user\)/);
  assert.match(route, /getMaxLoansForMemberType\(me\.memberType\)/);
  assert.equal(/searchParams/.test(route), false, "no client-chosen member or type");
});
