import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveLoanStatus } from "./loan-status.ts";

const NOW = Date.parse("2026-07-25T12:00:00Z");
const day = 1000 * 60 * 60 * 24;
const iso = (offsetDays: number) => new Date(NOW + offsetDays * day).toISOString();

test("a loan due in the future is active", () => {
  assert.equal(deriveLoanStatus({ status: "active", due_at: iso(3) }, NOW), "active");
});

test("a loan past its due date is overdue before the sweep stamps it", () => {
  assert.equal(deriveLoanStatus({ status: "active", due_at: iso(-1) }, NOW), "overdue");
});

test("a returned loan stays returned even when returned late", () => {
  assert.equal(deriveLoanStatus({ status: "returned", due_at: iso(-30) }, NOW), "returned");
});

test("renewing clears a stale overdue stamp", () => {
  assert.equal(deriveLoanStatus({ status: "overdue", due_at: iso(14) }, NOW), "active");
});

test("a loan still past due stays overdue", () => {
  assert.equal(deriveLoanStatus({ status: "overdue", due_at: iso(-2) }, NOW), "overdue");
});

test("a loan due this instant is not yet overdue", () => {
  assert.equal(deriveLoanStatus({ status: "active", due_at: iso(0) }, NOW), "active");
});
