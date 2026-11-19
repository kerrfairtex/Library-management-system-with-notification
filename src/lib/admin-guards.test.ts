import test from "node:test";
import assert from "node:assert/strict";
import {
  approveStudentAtomically,
  changeUserStatusAtomically,
  deleteUserGuarded,
} from "./admin-guards.ts";
import { changeUserRoleAtomically } from "./role-transition.ts";
import type { PublicUser } from "./types.ts";

const user: PublicUser = {
  id: "u-1", name: "Student", email: "s@x.local",
  role: "student", status: "active",
};

function fakeClient(result: { data: unknown; error: { message: string } | null }) {
  const calls: Array<{ fn: string; args: unknown }> = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return result;
      },
    },
  };
}

test("status RPC success requires a valid user shape", async () => {
  const ok = fakeClient({ data: user, error: null });
  const good = await changeUserStatusAtomically(ok.client as never, {
    userId: "u-1", nextStatus: "active", actorId: "a-1",
  });
  assert.deepEqual(good, { ok: true, data: user });

  const bad = fakeClient({ data: { id: "u-1" }, error: null });
  const result = await changeUserStatusAtomically(bad.client as never, {
    userId: "u-1", nextStatus: "active", actorId: "a-1",
  });
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /unexpected data/);
});

test("RPC errors never leak raw database text to callers", async () => {
  const raw = 'relation "users" does not exist LINE 1: SELECT * FROM users';
  for (const [fn, call] of [
    ["change_user_status", () => changeUserStatusAtomically(
      fakeClient({ data: null, error: { message: raw } }).client as never,
      { userId: "u-1", nextStatus: "active", actorId: "a-1" })],
    ["approve_student_account", () => approveStudentAtomically(
      fakeClient({ data: null, error: { message: raw } }).client as never,
      { userId: "u-1", actorId: "a-1" })],
    ["delete_user_guarded", () => deleteUserGuarded(
      fakeClient({ data: null, error: { message: raw } }).client as never,
      "u-1", "a-1")],
    ["change_user_role", () => changeUserRoleAtomically(
      fakeClient({ data: null, error: { message: raw } }).client as never,
      { userId: "u-1", nextRole: "faculty", actorId: "a-1" })],
  ] as const) {
    const result = await call();
    const message = "error" in result
      ? (typeof result.error === "string" ? result.error : result.error?.message ?? "")
      : "";
    assert.ok(message, `${fn} should fail`);
    assert.equal(message.includes(raw), false, `${fn} leaked raw DB error`);
    assert.equal(message.includes("LINE 1"), false, `${fn} leaked SQL details`);
  }
});

test("approval RPC returns user only on confirmed success", async () => {
  const ok = fakeClient({ data: user, error: null });
  const good = await approveStudentAtomically(ok.client as never, {
    userId: "u-1", actorId: "a-1",
  });
  assert.equal(good.ok, true);
  assert.equal(ok.calls[0].fn, "approve_student_account");

  const nullResult = fakeClient({ data: null, error: null });
  const bad = await approveStudentAtomically(nullResult.client as never, {
    userId: "u-1", actorId: "a-1",
  });
  assert.equal(bad.ok, false);
});

test("delete wrapper requires a boolean result", async () => {
  const ok = fakeClient({ data: true, error: null });
  assert.deepEqual(await deleteUserGuarded(ok.client as never, "u-1", "a-1"), { ok: true, data: true });
  const bad = fakeClient({ data: "true", error: null });
  const result = await deleteUserGuarded(bad.client as never, "u-1", "a-1");
  assert.equal(result.ok, false);
});
