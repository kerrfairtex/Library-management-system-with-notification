import test from "node:test";
import assert from "node:assert/strict";
import { canAccess } from "./permissions.ts";
import { describeAccountManagementProblem, describeRoleAssignmentProblem, isUserRole } from "./staff-rules.ts";

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

test("librarians run the desk and register patrons but not staff management", () => {
  assert.equal(canAccess("librarian", "loans.manage"), true);
  assert.equal(canAccess("librarian", "members.read"), true);
  assert.equal(canAccess("librarian", "books.write"), true);
  assert.equal(canAccess("librarian", "members.write"), true);
  assert.equal(canAccess("librarian", "staff.manage"), false);
});

const PATRONS = ["student", "faculty", "teacher", "community"] as const;

test("librarian may create and edit every patron account type", () => {
  for (const role of PATRONS) {
    assert.equal(describeAccountManagementProblem({ actorRole: "librarian", nextRole: role }), null, `create ${role}`);
    assert.equal(describeAccountManagementProblem({ actorRole: "librarian", targetRole: role }), null, `edit ${role}`);
    for (const next of PATRONS) {
      assert.equal(
        describeAccountManagementProblem({ actorRole: "librarian", targetRole: role, nextRole: next }),
        null, `${role} -> ${next}`
      );
    }
  }
});

test("librarian cannot create, edit, promote to, or demote from librarian/admin", () => {
  for (const privileged of ["librarian", "admin"] as const) {
    assert.match(describeAccountManagementProblem({ actorRole: "librarian", nextRole: privileged }) ?? "", /Only an admin/, `create ${privileged}`);
    assert.match(describeAccountManagementProblem({ actorRole: "librarian", targetRole: privileged }) ?? "", /Only an admin/, `edit ${privileged}`);
    assert.match(describeAccountManagementProblem({ actorRole: "librarian", targetRole: privileged, nextRole: "student" }) ?? "", /Only an admin/, `demote ${privileged}`);
    for (const patron of PATRONS) {
      assert.match(describeAccountManagementProblem({ actorRole: "librarian", targetRole: patron, nextRole: privileged }) ?? "", /Only an admin/, `promote ${patron}`);
    }
  }
});

test("admin may manage every account; patrons may manage none", () => {
  for (const target of ALL_ROLES) {
    for (const next of ALL_ROLES) {
      assert.equal(describeAccountManagementProblem({ actorRole: "admin", targetRole: target, nextRole: next }), null);
    }
  }
  for (const patron of PATRONS) {
    assert.match(describeAccountManagementProblem({ actorRole: patron, nextRole: "student" }) ?? "", /librarians and admins/);
  }
});

test("account routes enforce the librarian scope; delete stays admin-only", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const root = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
  // run-tests.mjs rewrites quoted "*.ts" to ".js"; map back (see roles-academic.test.ts).
  const read = (rel: string) => readFileSync(join(root, rel.replace(/\.js$/, ".ts")), "utf8");
  const users = read("src/app/api/users/route.ts");
  assert.match(users, /describeAccountManagementProblem\(\{ actorRole: user\.role, nextRole: role \}\)/);
  const userById = read("src/app/api/users/[id]/route.ts");
  assert.match(userById, /describeAccountManagementProblem\(\{[\s\S]*targetRole: target\.role/);
  const del = userById.slice(userById.indexOf("export async function DELETE"));
  assert.match(del, /requireAdmin\(\)/, "account delete is admin-only");
  const memberById = read("src/app/api/members/[id]/route.ts");
  const memberDel = memberById.slice(memberById.indexOf("export async function DELETE"));
  assert.match(memberDel, /"staff\.manage"/, "member delete is admin-only");
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
