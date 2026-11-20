import test from "node:test";
import assert from "node:assert/strict";
import { statusLabel, statusTone } from "./status-tone.ts";

test("a pending request is a warning, not an error", () => {
  assert.equal(statusTone("pending"), "warn");
  assert.equal(statusTone("rejected"), "danger");
  assert.equal(statusTone("ready"), "ok");
});

test("every loan state has a tone, including active", () => {
  assert.equal(statusTone("active"), "info");
  assert.equal(statusTone("overdue"), "danger");
  assert.equal(statusTone("returned"), "neutral");
});

test("unknown or missing statuses fall back to neutral", () => {
  assert.equal(statusTone("something_new"), "neutral");
  assert.equal(statusTone(undefined), "neutral");
});

test("labels are sentence case without underscores", () => {
  assert.equal(statusLabel("not_for_loan"), "Not for loan");
  assert.equal(statusLabel("pending"), "Pending");
  assert.equal(statusLabel("active"), "On loan");
  assert.equal(statusLabel(null), "Unknown");
});
