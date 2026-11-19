/**
 * Atomic, server-side admin mutation wrappers. Every call goes through a
 * locking RPC from migration 20261118_admin_protection_atomic.sql.
 * Fail closed: no plain-update fallback, and unexpected RPC results are
 * treated as errors rather than successes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicUser, UserStatus } from "./types";

export type GuardResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function isPublicUser(value: unknown): value is PublicUser {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.email === "string" &&
    typeof v.role === "string" &&
    typeof v.status === "string" &&
    (v.status === "active" || v.status === "pending")
  );
}

function rpcFailure(error: { message?: string } | null, fallback: string): string {
  // Never surface raw database text to the client. Diagnostic detail belongs
  // in server logs only, and only at the route layer.
  void error;
  return fallback;
}

export async function changeUserStatusAtomically(
  client: SupabaseClient,
  args: { userId: string; nextStatus: UserStatus; actorId: string }
): Promise<GuardResult<PublicUser>> {
  const { data, error } = await client.rpc("change_user_status", {
    p_user_id: args.userId,
    p_next_status: args.nextStatus,
    p_actor_id: args.actorId,
  });
  if (error) return { ok: false, error: rpcFailure(error, "Status change failed.") };
  if (!isPublicUser(data)) return { ok: false, error: "Status change returned unexpected data." };
  return { ok: true, data };
}

export async function approveStudentAtomically(
  client: SupabaseClient,
  args: { userId: string; actorId: string }
): Promise<GuardResult<PublicUser>> {
  const { data, error } = await client.rpc("approve_student_account", {
    p_user_id: args.userId,
    p_actor_id: args.actorId,
  });
  if (error) return { ok: false, error: rpcFailure(error, "Student approval failed.") };
  if (!isPublicUser(data)) return { ok: false, error: "Student approval returned unexpected data." };
  return { ok: true, data };
}

export async function deleteUserGuarded(
  client: SupabaseClient,
  userId: string,
  actorId: string
): Promise<GuardResult<boolean>> {
  const { data, error } = await client.rpc("delete_user_guarded", {
    p_user_id: userId,
    p_actor_id: actorId,
  });
  if (error) return { ok: false, error: rpcFailure(error, "Deletion failed.") };
  if (typeof data !== "boolean") return { ok: false, error: "Deletion returned unexpected data." };
  return { ok: true, data };
}
