import test from "node:test";
import assert from "node:assert/strict";
import { applyUserPatch, type UserPatchDeps } from "./user-patch.ts";
import type { PublicUser, UserRole } from "./types.ts";

const admin: PublicUser = {
  id: "actor-1", name: "Admin", email: "a@x.local",
  role: "admin", status: "active",
};
const target: PublicUser = { ...admin, id: "target-1", email: "t@x.local" };

type Calls = { profile: number; status: number; role: number; counts: number };

function deps(body: Record<string, unknown>, calls: Calls): UserPatchDeps {
  return {
    actor: admin,
    target,
    body,
    countAdmins: async () => { calls.counts += 1; return 2; },
    countOpenLoans: async () => 0,
    privilegedAssignmentDenied: (_actorRole: UserRole, nextRole: UserRole) =>
      nextRole === "admin" || nextRole === "librarian",
    mutateProfile: async () => { calls.profile += 1; return target; },
    mutateStatus: async () => { calls.status += 1; return { ok: true, data: target }; },
    mutateRole: async () => { calls.role += 1; return { ok: true, data: target }; },
  };
}

test("{name, role} is rejected before ANY mutation or admin count", async () => {
  const calls: Calls = { profile: 0, status: 0, role: 0, counts: 0 };
  const result = await applyUserPatch(deps({ name: "New", role: "faculty" }, calls));
  assert.equal(result.kind, "error");
  assert.equal(calls.profile, 0);
  assert.equal(calls.status, 0);
  assert.equal(calls.role, 0);
  assert.equal(calls.counts, 0);
});

test("{name, status} is rejected before ANY mutation or admin count", async () => {
  const calls: Calls = { profile: 0, status: 0, role: 0, counts: 0 };
  const result = await applyUserPatch(deps({ name: "New", status: "pending" }, calls));
  assert.equal(result.kind, "error");
  assert.equal(calls.profile, 0);
  assert.equal(calls.status, 0);
  assert.equal(calls.role, 0);
  assert.equal(calls.counts, 0);
});

test("valid name-only update performs exactly one profile mutation", async () => {
  const calls: Calls = { profile: 0, status: 0, role: 0, counts: 0 };
  const result = await applyUserPatch(deps({ name: "  New Name  " }, calls));
  assert.equal(result.kind, "success");
  assert.equal(calls.profile, 1);
  assert.equal(calls.role, 0);
  assert.equal(calls.status, 0);
});

test("valid role-only transition performs exactly one role mutation", async () => {
  const calls: Calls = { profile: 0, status: 0, role: 0, counts: 0 };
  const result = await applyUserPatch(deps({ role: "faculty", studentId: "EMP-001" }, calls));
  assert.equal(result.kind, "success");
  assert.equal(calls.role, 1);
  assert.equal(calls.profile, 0);
  assert.equal(calls.status, 0);
});

test("valid status-only transition performs exactly one status mutation", async () => {
  const calls: Calls = { profile: 0, status: 0, role: 0, counts: 0 };
  const result = await applyUserPatch(deps({ status: "active" }, calls));
  assert.equal(result.kind, "success");
  assert.equal(calls.status, 1);
  assert.equal(calls.profile, 0);
  assert.equal(calls.role, 0);
});

// ── ID number on role change ────────────────────────────────────────────────
function roleDeps(from: UserRole, body: Record<string, unknown>, seen: { id?: string | null; calls: number }): UserPatchDeps {
  return {
    ...deps(body, { profile: 0, status: 0, role: 0, counts: 0 }),
    target: { ...target, role: from },
    mutateRole: async (_next, idNumber) => {
      seen.calls += 1;
      seen.id = idNumber;
      return { ok: true, data: target };
    },
  };
}

test("student -> faculty without an Employee/Faculty ID is refused before the RPC", async () => {
  const seen = { calls: 0 } as { id?: string | null; calls: number };
  const result = await applyUserPatch(roleDeps("student", { role: "faculty" }, seen));
  assert.equal(result.kind, "error");
  assert.equal(result.kind === "error" && result.status, 400);
  assert.match(result.kind === "error" ? result.error : "", /Employee\/Faculty ID/);
  assert.equal(seen.calls, 0);
});

test("student -> faculty passes the entered ID (trimmed, zeros kept) to the RPC", async () => {
  const seen = { calls: 0 } as { id?: string | null; calls: number };
  const result = await applyUserPatch(roleDeps("student", { role: "faculty", studentId: " 00125 " }, seen));
  assert.equal(result.kind, "success");
  assert.equal(seen.id, "00125");
});

test("faculty -> teacher needs no new ID; the RPC keeps the current one", async () => {
  const seen = { calls: 0 } as { id?: string | null; calls: number };
  const result = await applyUserPatch(roleDeps("faculty", { role: "teacher" }, seen));
  assert.equal(result.kind, "success");
  assert.equal(seen.id, null);
});

test("moving to community needs no ID; a malformed ID is refused", async () => {
  {
    const seen = { calls: 0 } as { id?: string | null; calls: number };
    assert.equal((await applyUserPatch(roleDeps("student", { role: "community" }, seen))).kind, "success");
  }
  const seen = { calls: 0 } as { id?: string | null; calls: number };
  const bad = await applyUserPatch(roleDeps("community", { role: "student", studentId: "a b" }, seen));
  assert.equal(bad.kind, "error");
  assert.equal(seen.calls, 0);
});

// ── Open loans block account-type changes ───────────────────────────────────
test("a role change that moves the member type is refused while loans are open", async () => {
  const seen = { calls: 0 } as { id?: string | null; calls: number };
  const result = await applyUserPatch({
    ...roleDeps("student", { role: "faculty", studentId: "EMP-1" }, seen),
    countOpenLoans: async () => 2,
  });
  assert.equal(result.kind, "error");
  assert.equal(result.kind === "error" && result.status, 409);
  assert.match(result.kind === "error" ? result.error : "", /Return or transfer this member's 2 open loans/);
  assert.equal(seen.calls, 0, "no RPC call");
});

test("the same change goes through once loans are returned", async () => {
  const seen = { calls: 0 } as { id?: string | null; calls: number };
  const result = await applyUserPatch({
    ...roleDeps("student", { role: "faculty", studentId: "EMP-1" }, seen),
    countOpenLoans: async () => 0,
  });
  assert.equal(result.kind, "success");
  assert.equal(seen.calls, 1);
});

test("librarian <-> admin keeps the staff category, so open loans don't block it", async () => {
  let counted = 0;
  const result = await applyUserPatch({
    ...deps({ role: "admin" }, { profile: 0, status: 0, role: 0, counts: 0 }),
    target: { ...target, role: "librarian" },
    privilegedAssignmentDenied: () => false,
    countOpenLoans: async () => { counted += 1; return 3; },
  });
  assert.equal(result.kind, "success");
  assert.equal(counted, 0);
});
