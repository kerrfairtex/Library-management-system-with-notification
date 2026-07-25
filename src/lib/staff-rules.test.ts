import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeDeleteProblem,
  describePasswordProblem,
  describeRoleChangeProblem,
  isUserRole,
} from "./staff-rules.ts";
import type { PublicUser } from "./types.ts";

const admin: PublicUser = {
  id: "admin-1",
  name: "Head Librarian",
  email: "admin@trac.edu.ph",
  role: "admin",
};
const otherAdmin: PublicUser = { ...admin, id: "admin-2", email: "second@trac.edu.ph" };
const librarian: PublicUser = {
  id: "lib-1",
  name: "Desk Staff",
  email: "desk@trac.edu.ph",
  role: "librarian",
};
const student: PublicUser = {
  id: "stu-1",
  name: "Student",
  email: "student@trac.edu.ph",
  role: "student",
};

test("student, librarian, and admin are roles", () => {
  assert.equal(isUserRole("student"), true);
  assert.equal(isUserRole("admin"), true);
  assert.equal(isUserRole("librarian"), true);
  assert.equal(isUserRole("superuser"), false);
  assert.equal(isUserRole(""), false);
  assert.equal(isUserRole(undefined), false);
});

test("a short password is refused", () => {
  assert.match(String(describePasswordProblem("short")), /at least 8/);
  assert.equal(describePasswordProblem("longenough1"), null);
});

test("promoting a librarian to admin is always allowed", () => {
  assert.equal(
    describeRoleChangeProblem({
      actorId: admin.id,
      target: librarian,
      nextRole: "admin",
      adminCount: 1,
    }),
    null
  );
});

test("demoting an admin to student still protects the final admin", () => {
  assert.match(
    String(
      describeRoleChangeProblem({
        actorId: admin.id,
        target: otherAdmin,
        nextRole: "student",
        adminCount: 1,
      })
    ),
    /at least one admin/
  );
});

test("an admin cannot remove their own admin role", () => {
  assert.match(
    String(
      describeRoleChangeProblem({
        actorId: admin.id,
        target: admin,
        nextRole: "librarian",
        adminCount: 5,
      })
    ),
    /your own admin role/
  );
});

test("the last admin cannot be demoted", () => {
  assert.match(
    String(
      describeRoleChangeProblem({
        actorId: admin.id,
        target: otherAdmin,
        nextRole: "librarian",
        adminCount: 1,
      })
    ),
    /at least one admin/
  );
});

test("another admin can be demoted while others remain", () => {
  assert.equal(
    describeRoleChangeProblem({
      actorId: admin.id,
      target: otherAdmin,
      nextRole: "librarian",
      adminCount: 2,
    }),
    null
  );
});

test("setting the role a person already has is a no-op", () => {
  assert.equal(
    describeRoleChangeProblem({
      actorId: admin.id,
      target: admin,
      nextRole: "admin",
      adminCount: 1,
    }),
    null
  );
});

test("an admin cannot delete their own account", () => {
  assert.match(
    String(describeDeleteProblem({ actorId: admin.id, target: admin, adminCount: 3 })),
    /your own account/
  );
});

test("the last admin cannot be deleted", () => {
  assert.match(
    String(describeDeleteProblem({ actorId: admin.id, target: otherAdmin, adminCount: 1 })),
    /at least one admin/
  );
});

test("a librarian can be deleted even with a single admin", () => {
  assert.equal(
    describeDeleteProblem({ actorId: admin.id, target: librarian, adminCount: 1 }),
    null
  );
});

test("a student can be deleted without affecting admin protection", () => {
  assert.equal(
    describeDeleteProblem({ actorId: admin.id, target: student, adminCount: 1 }),
    null
  );
});
