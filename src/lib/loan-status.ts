import type { LoanStatus } from "./types";

/**
 * A loan past its due date is overdue whether or not the nightly sweep has
 * stamped the row yet, so reads derive the status instead of waiting for a
 * write. This also corrects a row still marked overdue after a renewal moved
 * its due date into the future.
 *
 * Kept free of database imports so it can be tested on its own.
 */
export function deriveLoanStatus(
  row: { status: LoanStatus; due_at: string },
  now: number = Date.now()
): LoanStatus {
  if (row.status === "returned") return "returned";
  return new Date(row.due_at).getTime() < now ? "overdue" : "active";
}
