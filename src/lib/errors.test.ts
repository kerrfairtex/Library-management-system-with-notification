import test from "node:test";
import assert from "node:assert/strict";
import { friendlyError } from "./errors.ts";

test("server faults never show raw server text", () => {
  const msg = friendlyError(500, 'duplicate key value violates unique constraint "members_pkey"');
  assert.equal(msg.includes("constraint"), false);
  assert.match(msg, /Try again/);
});

test("validation and permission messages pass through", () => {
  assert.equal(friendlyError(400, "Enter a valid email address."), "Enter a valid email address.");
  assert.equal(friendlyError(409, "That ID is already in use."), "That ID is already in use.");
});

test("missing messages get a plain fallback per status", () => {
  assert.match(friendlyError(401), /Sign in/);
  assert.match(friendlyError(403), /access/);
  assert.match(friendlyError(400, ""), /Try again/);
});
