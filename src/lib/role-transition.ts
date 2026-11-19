/**
 * Role transition: canonical role is users.role; canonical patron category is
 * members.member_type. All writes happen in one server-side transaction via
 * the change_user_role RPC — never as a best-effort table update.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isUserRole } from "./staff-rules";
import type { UserRole } from "./types";

const ACADEMIC_FIELDS = [
  "student_id", "department_id", "course_id", "year_level", "section",
] as const;
const PATRON_ROLES: readonly UserRole[] = ["student", "faculty", "teacher", "community"];

/** Pure patch used by the database RPC; also unit-tested directly. */
export function memberPatchForRoleTransition(
  previousRole: UserRole,
  nextRole: UserRole
): Record<string, unknown> {
  if (!isUserRole(previousRole) || !isUserRole(nextRole)) {
    throw new Error("Invalid role in transition.");
  }
  if (previousRole === nextRole) return {};
  const memberType = PATRON_ROLES.includes(nextRole) ? nextRole : "staff";
  const patch: Record<string, unknown> = { member_type: memberType };
  // Student-only academic fields never survive a role transition; the admin
  // must enter academic data for the new student explicitly.
  for (const field of ACADEMIC_FIELDS) patch[field] = null;
  return patch;
}

/**
 * Atomic role change; SQL (change_user_role RPC) is the authoritative source
 * of truth for the transaction and field-clearing policy. This wrapper only
 * validates inputs/response shape and never falls back to a table write.
 */
export async function changeUserRoleAtomically(
  client: SupabaseClient,
  args: { userId: string; nextRole: UserRole; actorId: string }
): Promise<{ data: unknown; error: { message: string } | null }> {
  if (!isUserRole(args.nextRole)) {
    return { data: null, error: { message: "Invalid role." } };
  }
  const { data, error } = await client.rpc("change_user_role", {
    p_user_id: args.userId,
    p_next_role: args.nextRole,
    p_actor_id: args.actorId,
  });
  if (error) return { data: null, error: { message: "Role transition failed." } };
  if (!data || typeof data !== "object" || typeof (data as Record<string, unknown>).id !== "string") {
    return { data: null, error: { message: "Role transition returned unexpected data." } };
  }
  return { data, error: null };
}
