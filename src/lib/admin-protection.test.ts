import test from "node:test";
import assert from "node:assert/strict";
import {
  describeDeleteProblem,
  describeRoleChangeProblem,
  describeStatusChangeProblem,
  describeStatusTransitionProblem,
} from "./staff-rules.ts";
import { PATRON_ROLES, PRIVILEGED_ROLES, type PublicUser, type UserRole } from "./types.ts";

function user(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: "actor-1", name: "Admin", email: "a@x.local",
    role: "admin", status: "active", ...overrides,
  };
}

test("last ACTIVE admin cannot be demoted by another admin", () => {
  const target = user({ id: "other", role: "admin" });
  const problem = describeRoleChangeProblem({
    actorId: "third-admin", target, nextRole: "student", adminCount: 1,
  });
  assert.match(problem ?? "", /at least one admin/);
});

test("admin cannot demote themselves", () => {
  const problem = describeRoleChangeProblem({
    actorId: "actor-1", target: user(), nextRole: "librarian", adminCount: 5,
  });
  assert.match(problem ?? "", /own admin role/);
});

test("last admin cannot be deleted and self-delete is blocked", () => {
  assert.match(
    describeDeleteProblem({ actorId: "other", target: user({ id: "x" }), adminCount: 1 }) ?? "",
    /at least one admin/
  );
  assert.match(
    describeDeleteProblem({ actorId: "actor-1", target: user(), adminCount: 5 }) ?? "",
    /own account/
  );
});

test("an admin cannot change their own status (no self-deactivation)", () => {
  const problem = describeStatusChangeProblem({ actorId: "actor-1", target: user() });
  assert.match(problem ?? "", /own verification status/);
});

test("patron roles are exactly the four member-backed roles", () => {
  assert.deepEqual([...PATRON_ROLES], ["student", "faculty", "teacher", "community"]);
  assert.deepEqual([...PRIVILEGED_ROLES], ["librarian", "admin"]);
  for (const role of PATRON_ROLES) {
    assert.equal(PRIVILEGED_ROLES.includes(role), false, `${role} must not be privileged`);
  }
});

test("every system role is classified as patron or privileged", () => {
  const all: UserRole[] = ["student", "faculty", "teacher", "community", "librarian", "admin"];
  for (const role of all) {
    assert.equal(
      PATRON_ROLES.includes(role) || PRIVILEGED_ROLES.includes(role),
      true,
      `${role} must be classified`
    );
  }
});

test("last-admin guards use the active-admin count and block final transitions", () => {
  // The routes pass await countAdmins() (active-only) into these guards; pin
  // that contract by exercising the production rules with that count.
  const activeAdmins = 1;
  assert.match(
    describeRoleChangeProblem({
      actorId: "other-admin",
      target: user({ id: "x", role: "admin" }),
      nextRole: "student",
      adminCount: activeAdmins,
    }) ?? "",
    /at least one admin/
  );
  assert.match(
    describeStatusTransitionProblem({
      actorId: "other-admin",
      target: user({ id: "x", role: "admin", status: "active" }),
      nextStatus: "pending",
      adminCount: activeAdmins,
    }) ?? "",
    /at least one active admin/
  );
  assert.equal(
    describeStatusTransitionProblem({
      actorId: "other-admin",
      target: user({ id: "x", role: "librarian", status: "active" }),
      nextStatus: "pending",
      adminCount: activeAdmins,
    }),
    null
  );
});


// NOTE: migration SQL privilege/grant assertions cannot run in the temp-dir
// test harness. Staging must verify effective privileges with \df+ and
// information_schema.role_routine_grants. Do not claim these are unit-tested.
