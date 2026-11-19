import test from "node:test";
import assert from "node:assert/strict";
import {
  memberPatchForRoleTransition,
  changeUserRoleAtomically,
} from "./role-transition.ts";
import type { UserRole } from "./types.ts";

const ACADEMIC_FIELDS = ["student_id", "department_id", "course_id", "year_level", "section"] as const;

test("student -> faculty sets member_type faculty and clears student-only fields", () => {
  const patch = memberPatchForRoleTransition("student", "faculty");
  assert.equal(patch.member_type, "faculty");
  for (const f of ACADEMIC_FIELDS) assert.equal((patch as Record<string, unknown>)[f], null, f);
});

test("faculty -> student sets member_type student with cleared academic fields", () => {
  const patch = memberPatchForRoleTransition("faculty", "student");
  assert.equal(patch.member_type, "student");
  for (const f of ACADEMIC_FIELDS) assert.equal((patch as Record<string, unknown>)[f], null, f);
});

test("student -> librarian maps to staff category and clears academic fields", () => {
  const patch = memberPatchForRoleTransition("student", "librarian");
  assert.equal(patch.member_type, "staff");
  for (const f of ACADEMIC_FIELDS) assert.equal((patch as Record<string, unknown>)[f], null, f);
});

test("admin -> student maps to student member category", () => {
  assert.equal(memberPatchForRoleTransition("admin", "student").member_type, "student");
});

test("no-op transition produces an empty patch", () => {
  assert.deepEqual(memberPatchForRoleTransition("admin", "admin"), {});
});

test("role change uses exactly one atomic RPC and never a separate update fallback", async () => {
  const calls: Array<{ fn: string; args: unknown }> = [];
  const fakeClient = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return { data: { id: "u-1", role: "faculty", status: "active" }, error: null };
    },
    from: () => { throw new Error("non-atomic table fallback is not allowed"); },
  };
  const result = await changeUserRoleAtomically(fakeClient as never, {
    userId: "u-1", nextRole: "faculty", actorId: "a-1",
  });
  assert.equal(result.error, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fn, "change_user_role");
  assert.deepEqual(calls[0].args, { p_user_id: "u-1", p_next_role: "faculty", p_actor_id: "a-1" });
});

test("atomic role-change failure propagates without any partial fallback write", async () => {
  const fakeClient = {
    rpc: async () => ({ data: null, error: { message: "last active admin" } }),
    from: () => { throw new Error("non-atomic table fallback is not allowed"); },
  };
  const result = await changeUserRoleAtomically(fakeClient as never, {
    userId: "u-1", nextRole: "student", actorId: "a-1",
  });
  assert.equal(result.data, null);
  assert.match(result.error?.message ?? "", /failed/i);
});

test("invalid role is rejected before any database call", async () => {
  let called = false;
  const fakeClient = { rpc: async () => { called = true; return { data: null, error: null }; } };
  const result = await changeUserRoleAtomically(fakeClient as never, {
    userId: "u-1", nextRole: "superadmin" as UserRole, actorId: "a-1",
  });
  assert.equal(called, false);
  assert.match(result.error?.message ?? "", /Invalid role/);
});
