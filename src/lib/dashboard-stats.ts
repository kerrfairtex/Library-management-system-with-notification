/**
 * Pure stats helpers for the role dashboards. No database or React imports:
 * every function takes rows the existing API already returns plus `now`, so
 * each number on a dashboard can be unit-tested.
 */
import type { Loan, UserStatistics, UserRole } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Default loan limit when no circulation rule exists (mirrors enforce_loan_capacity). */
export const DEFAULT_MAX_LOANS = 3;

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** True when two instants fall on the same calendar day in the viewer's timezone. */
export function isSameLocalDay(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** Whole days until `dueAt` (negative once overdue), counted by calendar day. */
export function calendarDaysUntil(dueAt: string, now: Date): number {
  const due = new Date(dueAt);
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / DAY_MS);
}

// ── Patron ──────────────────────────────────────────────────────────────────

/** Row shapes returned by GET /api/my-loans (snake_case, straight from the DB). */
export type MyLoanRow = {
  id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  status: string;
  books: { title: string; author?: string | null } | null;
};
export type MyHoldRow = {
  id: string;
  status: string;
  placed_at: string;
  books: { title: string } | null;
};
export type MyFineRow = { id: string; amount_outstanding: string | number };

export type BorrowedBook = {
  id: string;
  title: string;
  author: string | null;
  dueAt: string;
  daysLeft: number;
  overdue: boolean;
};

/** Books currently out, soonest due first; overdue = past due by the clock. */
export function currentlyBorrowed(loans: readonly MyLoanRow[], now: Date): BorrowedBook[] {
  return loans
    .filter((l) => l.status !== "returned" && !l.returned_at)
    .map((l) => ({
      id: l.id,
      title: l.books?.title ?? "Unknown title",
      author: l.books?.author ?? null,
      dueAt: l.due_at,
      daysLeft: calendarDaysUntil(l.due_at, now),
      overdue: new Date(l.due_at).getTime() < now.getTime(),
    }))
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

/** Total still owed across fines; never negative. */
export function finesOwed(fines: readonly { amount_outstanding?: unknown; amountOutstanding?: unknown }[]): number {
  const total = fines.reduce(
    (sum, f) => sum + Math.max(0, toNumber(f.amount_outstanding ?? f.amountOutstanding)),
    0
  );
  return Math.round(total * 100) / 100;
}

/** Loans left before the per-type limit; never negative. */
export function loanLimitRemaining(maxLoans: number | null | undefined, activeLoans: number): number {
  const max = maxLoans ?? DEFAULT_MAX_LOANS;
  return Math.max(0, max - activeLoans);
}

export function holdCounts(holds: readonly { status: string }[]): { waiting: number; ready: number } {
  return {
    waiting: holds.filter((h) => h.status === "pending").length,
    ready: holds.filter((h) => h.status === "ready").length,
  };
}

export type ActivityItem = { id: string; at: string; verb: "Borrowed" | "Returned" | "Placed a hold on"; title: string };

/** The patron's own recent events, newest first. */
export function recentActivity(
  loans: readonly MyLoanRow[],
  holds: readonly MyHoldRow[],
  limit = 6
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const l of loans) {
    const title = l.books?.title ?? "Unknown title";
    items.push({ id: `b-${l.id}`, at: l.borrowed_at, verb: "Borrowed", title });
    if (l.returned_at) items.push({ id: `r-${l.id}`, at: l.returned_at, verb: "Returned", title });
  }
  for (const h of holds) {
    items.push({ id: `h-${h.id}`, at: h.placed_at, verb: "Placed a hold on", title: h.books?.title ?? "Unknown title" });
  }
  return items
    .filter((i) => i.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

// ── Librarian ───────────────────────────────────────────────────────────────

export function deskToday(loans: readonly Pick<Loan, "borrowedAt" | "returnedAt">[], now: Date) {
  return {
    checkouts: loans.filter((l) => isSameLocalDay(l.borrowedAt, now)).length,
    returns: loans.filter((l) => isSameLocalDay(l.returnedAt, now)).length,
  };
}

/** Open loans past due, most overdue first. */
export function overdueLoans<T extends Pick<Loan, "dueAt" | "returnedAt" | "status">>(
  loans: readonly T[],
  now: Date
): (T & { daysOverdue: number })[] {
  return loans
    .filter((l) => l.status !== "returned" && !l.returnedAt && new Date(l.dueAt).getTime() < now.getTime())
    .map((l) => ({ ...l, daysOverdue: Math.max(1, -calendarDaysUntil(l.dueAt, now)) }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/** Outstanding total, how many members owe, and how much was collected today. */
export function finesSummary(
  fines: readonly { memberId: string; amountOutstanding: number; amount: number; paidAt: string | null }[],
  now: Date
) {
  const owing = fines.filter((f) => toNumber(f.amountOutstanding) > 0);
  return {
    outstanding: finesOwed(owing),
    membersOwing: new Set(owing.map((f) => f.memberId)).size,
    paidToday: finesOwed(
      fines
        .filter((f) => isSameLocalDay(f.paidAt, now))
        .map((f) => ({ amountOutstanding: toNumber(f.amount) - toNumber(f.amountOutstanding) }))
    ),
  };
}

/** Raw hold row as GET /api/holds returns it to staff. */
export type DeskHoldRow = {
  id: string;
  book_id: string;
  member_id: string;
  status: string;
  kind?: string | null;
  placed_at: string;
  expires_at?: string | null;
};

/**
 * Splits the open hold queue: reservations still waiting for a copy (oldest
 * first) and copies on the shelf awaiting pickup (soonest expiry first).
 * Borrow requests are a separate queue and are counted on their own.
 */
export function deskHoldQueues(holds: readonly DeskHoldRow[]) {
  const isRequest = (h: DeskHoldRow) => h.kind === "borrow_request";
  const byPlaced = (a: DeskHoldRow, b: DeskHoldRow) =>
    new Date(a.placed_at).getTime() - new Date(b.placed_at).getTime();
  const expiry = (h: DeskHoldRow) => (h.expires_at ? new Date(h.expires_at).getTime() : Number.POSITIVE_INFINITY);
  return {
    waiting: holds.filter((h) => !isRequest(h) && h.status === "pending").sort(byPlaced),
    pickups: holds.filter((h) => h.status === "ready").sort((a, b) => expiry(a) - expiry(b)),
    borrowRequests: holds.filter((h) => isRequest(h) && h.status === "pending").length,
  };
}

export function pendingSignups<T extends { status?: string }>(users: readonly T[]): T[] {
  return users.filter((u) => u.status === "pending");
}

// ── Admin ───────────────────────────────────────────────────────────────────

export function roleCounts(stats: UserStatistics): { role: UserRole; count: number }[] {
  return [
    { role: "student", count: stats.students },
    { role: "faculty", count: stats.faculty },
    { role: "teacher", count: stats.teachers },
    { role: "community", count: stats.community },
    { role: "librarian", count: stats.librarians },
    { role: "admin", count: stats.admins },
  ];
}

// ── Formatting ──────────────────────────────────────────────────────────────

export function peso(amount: number): string {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "Due today", "Due tomorrow", "3 days left", "2 days overdue". */
export function dueLabel(daysLeft: number, overdue: boolean): string {
  if (overdue) {
    if (daysLeft >= 0) return "Overdue today";
    const late = -daysLeft;
    return `${late} day${late === 1 ? "" : "s"} overdue`;
  }
  if (daysLeft <= 0) return "Due today";
  if (daysLeft === 1) return "Due tomorrow";
  return `${daysLeft} days left`;
}
