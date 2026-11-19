import test from "node:test";
import assert from "node:assert/strict";
import { notificationAudienceFor } from "./notification-policy.ts";
import { PATRON_ROLES, PRIVILEGED_ROLES } from "./types.ts";

/** Tests the same production helper the notification and dashboard routes use. */
test("all patron roles map to the member audience", () => {
  for (const role of PATRON_ROLES) {
    assert.equal(notificationAudienceFor(role), "member", `${role} must be member-scoped`);
  }
});

test("librarian and admin map to the staff audience", () => {
  for (const role of PRIVILEGED_ROLES) {
    assert.equal(notificationAudienceFor(role), "staff", `${role} needs the staff inbox`);
  }
});

test("unknown, null and undefined roles are denied (no staff fallback)", () => {
  for (const role of ["not_a_role", "", null, undefined]) {
    assert.equal(notificationAudienceFor(role), null, `${String(role)} must fail closed`);
  }
});


// Integration coverage unavailable: route handlers require a live Supabase
// session. The assertions above exercise the real production policy helper.
