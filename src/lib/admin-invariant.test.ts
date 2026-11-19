import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describeDeleteProblem,
  describeRoleChangeProblem,
  describeStatusTransitionProblem,
} from "./staff-rules.ts";
import type { PublicUser } from "./types.ts";

const admin: PublicUser = {
  id: "target-1", name: "Admin", email: "a@x.local", role: "admin", status: "active",
};

test("final active admin cannot be demoted, deactivated or deleted (production rules)", () => {
  assert.match(
    describeRoleChangeProblem({
      actorId: "other", target: admin, nextRole: "student", adminCount: 1,
    }) ?? "", /at least one admin/
  );
  assert.match(
    describeStatusTransitionProblem({
      actorId: "other", target: admin, nextStatus: "pending", adminCount: 1,
    }) ?? "", /at least one active admin/
  );
  assert.match(
    describeDeleteProblem({ actorId: "other", target: admin, adminCount: 1 }) ?? "",
    /at least one admin/
  );
});

test("with two active admins the guarded transitions are permitted", () => {
  assert.equal(describeRoleChangeProblem({
    actorId: "other", target: admin, nextRole: "student", adminCount: 2,
  }), null);
  assert.equal(describeStatusTransitionProblem({
    actorId: "other", target: admin, nextStatus: "pending", adminCount: 2,
  }), null);
  assert.equal(describeDeleteProblem({ actorId: "other", target: admin, adminCount: 2 }), null);
});

test("every protected RPC acquires the shared advisory invariant lock before counting or mutating", () => {
  // Reads the actual migration source; fails if any RPC drops the lock.
  const sql = readFileSync(
    join(process.env.TRAC_PROJECT_ROOT ?? process.cwd(), "supabase", "migrations", "20261118_admin_protection_atomic.sql"),
    "utf8"
  );
  assert.match(sql, /pg_advisory_xact_lock\(727314\)/);
  for (const fn of [
    "change_user_role", "change_user_status", "delete_user_guarded", "approve_student_account",
  ]) {
    const start = sql.indexOf(`function public.${fn}(`);
    assert.notEqual(start, -1, `${fn} missing`);
    const next = sql.indexOf("$$;", start);
    const body = sql.slice(start, next);
    const lockAt = body.indexOf("perform public.lock_admin_invariant()");
    assert.notEqual(lockAt, -1, `${fn} missing invariant lock`);
    const firstCount = body.search(/(select count\(\*\)|update public\.users|delete from public\.users)/);
    assert.ok(firstCount === -1 || lockAt < firstCount, `${fn} locks after count/mutation`);
  }
});

test("rollback removes the helper and all guarded functions", () => {
  const down = readFileSync(
    join(process.env.TRAC_PROJECT_ROOT ?? process.cwd(), "supabase", "migrations", "20261118_admin_protection_atomic_down.sql"),
    "utf8"
  );
  for (const name of [
    "lock_admin_invariant", "change_user_role", "change_user_status",
    "delete_user_guarded", "approve_student_account",
  ]) {
    assert.match(down, new RegExp(`drop function if exists public\\.${name}\\(`));
  }
});
