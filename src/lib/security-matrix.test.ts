import test from "node:test";
import assert from "node:assert/strict";
import { canAccess } from "./permissions.ts";
import { describeRoleAssignmentProblem, isUserRole } from "./staff-rules.ts";

const ALL_ROLES = ["student", "faculty", "teacher", "community", "librarian", "admin"] as const;

test("students cannot access administrative functions", () => {
  const forbidden = ["members.write", "staff.manage", "books.write", "loans.manage"] as const;
  for (const capability of forbidden) {
    assert.equal(canAccess("student", capability), false, `student must not have ${capability}`);
  }
});

test("faculty cannot acquire librarian privileges", () => {
  const librarianOnly = ["books.write", "members.read", "loans.manage"] as const;
  for (const capability of librarianOnly) {
    assert.equal(canAccess("faculty", capability), false, `faculty must not have ${capability}`);
  }
});

test("teachers cannot acquire administrator privileges", () => {
  for (const capability of ["staff.manage", "members.write", "books.write"] as const) {
    assert.equal(canAccess("teacher", capability), false, `teacher must not have ${capability}`);
  }
});

test("community accounts receive only patron functionality", () => {
  for (const capability of ["dashboard.read", "books.read", "notifications.read", "holds.place", "loans.request"] as const) {
    assert.equal(canAccess("community", capability), true, `community should have ${capability}`);
  }
  for (const capability of ["books.write", "members.read", "members.write", "loans.manage", "staff.manage"] as const) {
    assert.equal(canAccess("community", capability), false, `community must not have ${capability}`);
  }
});

test("librarians retain authorized library operations but not user management", () => {
  assert.equal(canAccess("librarian", "loans.manage"), true);
  assert.equal(canAccess("librarian", "members.read"), true);
  assert.equal(canAccess("librarian", "books.write"), true);
  assert.equal(canAccess("librarian", "staff.manage"), false);
  assert.equal(canAccess("librarian", "members.write"), false);
});

test("admins retain full control", () => {
  assert.equal(canAccess("admin", "staff.manage"), true);
  assert.equal(canAccess("admin", "members.write"), true);
  assert.equal(canAccess("admin", "loans.manage"), true);
});

test("all six roles are recognized and unknown roles are not", () => {
  assert.deepEqual(ALL_ROLES.filter(isUserRole), [...ALL_ROLES]);
  assert.equal(isUserRole("superadmin"), false);
});

test("privileged role assignment guard rejects every non-admin actor", () => {
  for (const actor of ALL_ROLES.filter((r) => r !== "admin")) {
    for (const privileged of ["librarian", "admin"] as const) {
      const problem = describeRoleAssignmentProblem({ actorRole: actor, nextRole: privileged });
      assert.match(problem ?? "", /Only an admin/, `${actor} -> ${privileged}`);
    }
  }
  for (const next of ALL_ROLES) {
    assert.equal(describeRoleAssignmentProblem({ actorRole: "admin", nextRole: next }), null);
  }
});

test("guard does not block non-privileged role assignment by non-admin", () => {
  for (const next of ["student", "faculty", "teacher", "community"] as const) {
    assert.equal(describeRoleAssignmentProblem({ actorRole: "librarian", nextRole: next }), null);
  }
});
