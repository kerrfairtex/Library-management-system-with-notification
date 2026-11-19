import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  calendarDaysUntil,
  currentlyBorrowed,
  deskHoldQueues,
  deskToday,
  dueLabel,
  finesOwed,
  finesSummary,
  holdCounts,
  isSameLocalDay,
  loanLimitRemaining,
  overdueLoans,
  pendingSignups,
  peso,
  recentActivity,
  roleCounts,
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

// ── Librarian ───────────────────────────────────────────────────────────────
test("deskToday counts today's checkouts and returns only", () => {
  const out = deskToday(
    [
      { borrowedAt: at(19, 9), returnedAt: null },
      { borrowedAt: at(12), returnedAt: at(19, 10) },
      { borrowedAt: at(18), returnedAt: at(18, 16) },
    ],
    NOW
  );
  assert.deepEqual(out, { checkouts: 1, returns: 1 });
});

test("overdueLoans keeps open past-due loans, most overdue first", () => {
  const out = overdueLoans(
    [
      { id: "a", dueAt: at(17), returnedAt: null, status: "active" as const },
      { id: "b", dueAt: at(10), returnedAt: null, status: "overdue" as const },
      { id: "c", dueAt: at(10), returnedAt: at(11), status: "returned" as const },
      { id: "d", dueAt: at(25), returnedAt: null, status: "active" as const },
    ],
    NOW
  );
  assert.deepEqual(out.map((l) => [l.id, l.daysOverdue]), [["b", 9], ["a", 2]]);
});

test("deskHoldQueues separates waiting holds, pickups and borrow requests", () => {
  const row = (id: string, o: Partial<{ status: string; kind: string; placed_at: string; expires_at: string | null }>) => ({
    id, book_id: "b", member_id: "m", status: "pending", kind: "hold", placed_at: at(10), expires_at: null, ...o,
  });
  const q = deskHoldQueues([
    row("late", { placed_at: at(15) }),
    row("early", { placed_at: at(11) }),
    row("pick2", { status: "ready", expires_at: at(23) }),
    row("pick1", { status: "ready", expires_at: at(21) }),
    row("req", { kind: "borrow_request" }),
  ]);
  assert.deepEqual(q.waiting.map((h) => h.id), ["early", "late"]);
  assert.deepEqual(q.pickups.map((h) => h.id), ["pick1", "pick2"]);
  assert.equal(q.borrowRequests, 1);
});

test("finesSummary totals what is owed, who owes it, and today's payments", () => {
  const s = finesSummary(
    [
      { memberId: "m1", amount: 50, amountOutstanding: 50, paidAt: null },
      { memberId: "m1", amount: 20, amountOutstanding: 5, paidAt: null },
      { memberId: "m2", amount: 30, amountOutstanding: 0, paidAt: at(19, 9) },
      { memberId: "m3", amount: 10, amountOutstanding: 0, paidAt: at(18) },
    ],
    NOW
  );
  assert.deepEqual(s, { outstanding: 55, membersOwing: 1, paidToday: 30 });
});

test("pendingSignups keeps only accounts awaiting approval", () => {
  assert.deepEqual(pendingSignups([{ id: 1, status: "pending" }, { id: 2, status: "active" }, { id: 3 }]).map((u) => u.id), [1]);
});

// ── Admin ───────────────────────────────────────────────────────────────────
test("roleCounts lists all six roles with whole-percent shares", () => {
  const rows = roleCounts({
    totalAccounts: 10, activeAccounts: 9, pendingAccounts: 1,
    students: 6, faculty: 1, teachers: 1, community: 0, librarians: 1, admins: 1,
    totalMemberProfiles: 8, incompleteStudentProfiles: 2,
  });
  assert.deepEqual(rows.map((r) => r.role), ["student", "faculty", "teacher", "community", "librarian", "admin"]);
  assert.deepEqual(rows.map((r) => r.share), [60, 10, 10, 0, 10, 10]);
  assert.equal(roleCounts({
    totalAccounts: 0, activeAccounts: 0, pendingAccounts: 0, students: 0, faculty: 0, teachers: 0,
    community: 0, librarians: 0, admins: 0, totalMemberProfiles: 0, incompleteStudentProfiles: 0,
  })[0].share, 0);
});

test("admin statistics endpoint stays admin-only", () => {
  assert.match(read("src/app/api/admin/user-statistics/route.ts"), /requireCapability\(\s*"staff\.manage"/);
});
