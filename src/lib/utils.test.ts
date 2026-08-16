import assert from "node:assert/strict";
import { test } from "node:test";
import { overdueFine } from "./utils.ts";

const NOW = Date.parse("2026-08-16T12:00:00Z");
const day = 1000 * 60 * 60 * 24;
const iso = (offsetDays: number) => new Date(NOW + offsetDays * day).toISOString();

test("a loan not yet due has no fine", () => {
  assert.equal(overdueFine(iso(3), NOW), 0);
  assert.equal(overdueFine(iso(0), NOW), 0);
});

test("a loan overdue by less than a day still charges the first day (₱5)", () => {
  const twoHours = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
  assert.equal(overdueFine(twoHours, NOW), 5);
});

test("full days are charged at ₱5 per day", () => {
  assert.equal(overdueFine(iso(-2), NOW), 10);
  assert.equal(overdueFine(iso(-7), NOW), 35);
});

test("fractional days round down but never below one day", () => {
  const oneAndHalf = new Date(NOW - 1.5 * day).toISOString();
  assert.equal(overdueFine(oneAndHalf, NOW), 5);
});

test("an invalid date yields no fine", () => {
  assert.equal(overdueFine("not-a-date", NOW), 0);
});
