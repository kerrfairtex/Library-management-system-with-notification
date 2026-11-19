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
  const result = await applyUserPatch(deps({ role: "faculty" }, calls));
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
