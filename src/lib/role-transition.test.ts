import test from "node:test";
import assert from "node:assert/strict";
import {
  memberPatchForRoleTransition,
  changeUserRoleAtomically,
} from "./role-transition.ts";
import type { UserRole } from "./types.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ACADEMIC_FIELDS = ["student_id", "department_id", "course_id", "year_level", "section"] as const;

test("student -> faculty sets member_type faculty and clears student-only fields", () => {
  const patch = memberPatchForRoleTransition("student", "faculty", { currentId: "2026-00125" });
  assert.equal(patch.member_type, "faculty");
  // A Student ID is not an Employee ID, so it is not carried over.
  for (const f of ACADEMIC_FIELDS) assert.equal((patch as Record<string, unknown>)[f], null, f);
});

test("student -> faculty saves the newly entered Employee/Faculty ID", () => {
  const patch = memberPatchForRoleTransition("student", "faculty", { currentId: "2026-00125", enteredId: " 00777 " });
  assert.equal(patch.student_id, "00777");
  for (const f of ["department_id", "course_id", "year_level", "section"]) {
    assert.equal((patch as Record<string, unknown>)[f], null, f);
  }
});

test("faculty <-> teacher keep their Employee/Faculty ID", () => {
  assert.equal(memberPatchForRoleTransition("faculty", "teacher", { currentId: "EMP-9" }).student_id, "EMP-9");
  assert.equal(memberPatchForRoleTransition("teacher", "faculty", { currentId: "EMP-9" }).student_id, "EMP-9");
});

test("moving to librarian/admin always clears the ID", () => {
  assert.equal(memberPatchForRoleTransition("faculty", "librarian", { currentId: "EMP-9", enteredId: "X-1" }).student_id, null);
});

test("role change RPC passes p_id_number only when an ID is entered", async () => {
  const calls: unknown[] = [];
  const client = { rpc: async (_fn: string, args: unknown) => { calls.push(args); return { data: { id: "u-1" }, error: null }; } };
  await changeUserRoleAtomically(client as never, { userId: "u-1", nextRole: "faculty", actorId: "a-1", idNumber: "EMP-1" });
  await changeUserRoleAtomically(client as never, { userId: "u-1", nextRole: "teacher", actorId: "a-1" });
  assert.equal((calls[0] as Record<string, unknown>).p_id_number, "EMP-1");
  assert.equal("p_id_number" in (calls[1] as Record<string, unknown>), false);
});

test("missing or duplicate ID from the RPC maps to fixed, readable messages", async () => {
  const failing = (code: string) => ({
    rpc: async () => ({ data: null, error: { code, message: "raw db text LINE 1" } }),
  });
  const missing = await changeUserRoleAtomically(failing("23502") as never, { userId: "u", nextRole: "teacher", actorId: "a" });
  assert.equal(missing.error?.message, "Enter the Employee/Faculty ID to make this person teacher.");
  const dup = await changeUserRoleAtomically(failing("23505") as never, { userId: "u", nextRole: "faculty", actorId: "a", idNumber: "E-1" });
  assert.equal(dup.error?.message, "A faculty with this ID number already exists.");
});

test("change_user_role migration keeps or takes the ID and refuses a missing one", () => {
  const root = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
  const sql = readFileSync(join(root, "supabase/migrations/20261122_role_change_keeps_id.sql"), "utf8");
  assert.match(sql, /p_id_number text default null/);
  assert.match(sql, /v_prev_type in \('faculty','teacher'\) and v_next_type in \('faculty','teacher'\)/);
  assert.match(sql, /errcode = '23502'/);
  assert.match(sql, /student_id = v_id/);
  assert.match(sql, /grant execute on function public\.change_user_role\(uuid, text, uuid, text\) to service_role/);
  assert.match(sql, /revoke all on function public\.change_user_role\(uuid, text, uuid, text\) from public, anon, authenticated/);
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
