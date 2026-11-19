/**
 * Role transition: canonical role is users.role; canonical patron category is
 * members.member_type. All writes happen in one server-side transaction via
 * the change_user_role RPC — never as a best-effort table update.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { duplicateIdNumberMessage, idNumberAfterTypeChange, idNumberLabel } from "./academic";
import { isUserRole } from "./staff-rules";
import type { MemberType, UserRole } from "./types";

const ACADEMIC_FIELDS = [
  "student_id", "department_id", "course_id", "year_level", "section",
] as const;
const PATRON_ROLES: readonly UserRole[] = ["student", "faculty", "teacher", "community"];

/** The member category an account role maps to (librarian/admin -> staff). */
export function memberTypeForRole(role: UserRole): MemberType {
  return PATRON_ROLES.includes(role) ? (role as MemberType) : "staff";
}

/**
 * Pure mirror of the change_user_role RPC's member update; unit-tested.
 * Department/course/year/section never survive a role change. The ID number
 * follows idNumberAfterTypeChange: a newly entered ID wins, faculty <-> teacher
 * keep theirs, anything else is cleared.
 */
export function memberPatchForRoleTransition(
  previousRole: UserRole,
  nextRole: UserRole,
  ids: { currentId?: string | null; enteredId?: unknown } = {}
): Record<string, unknown> {
  if (!isUserRole(previousRole) || !isUserRole(nextRole)) {
    throw new Error("Invalid role in transition.");
  }
  if (previousRole === nextRole) return {};
  const memberType = memberTypeForRole(nextRole);
  const patch: Record<string, unknown> = { member_type: memberType };
  for (const field of ACADEMIC_FIELDS) patch[field] = null;
  patch.student_id = idNumberAfterTypeChange(
    memberTypeForRole(previousRole), memberType, ids.currentId ?? null, ids.enteredId
  ).idNumber;
  return patch;
}

/**
 * Atomic role change; SQL (change_user_role RPC) is the authoritative source
 * of truth for the transaction and field-clearing policy. This wrapper only
 * validates inputs/response shape and never falls back to a table write.
 */
export async function changeUserRoleAtomically(
  client: SupabaseClient,
  args: { userId: string; nextRole: UserRole; actorId: string; idNumber?: string | null }
): Promise<{ data: unknown; error: { message: string } | null }> {
  if (!isUserRole(args.nextRole)) {
    return { data: null, error: { message: "Invalid role." } };
  }
  const params: Record<string, unknown> = {
    p_user_id: args.userId,
    p_next_role: args.nextRole,
    p_actor_id: args.actorId,
  };
  // Only sent when entered, so calls without an ID keep working against the
  // pre-20261122 three-argument function.
  if (args.idNumber) params.p_id_number = args.idNumber;
  const { data, error } = await client.rpc("change_user_role", params);
  if (error) {
    // Map known SQLSTATEs to fixed messages; never return raw database text.
    const code = (error as { code?: string }).code;
    const memberType = memberTypeForRole(args.nextRole);
    if (code === "23505") {
      return { data: null, error: { message: duplicateIdNumberMessage(memberType) } };
    }
    if (code === "23502") {
      return {
        data: null,
        error: { message: `Enter the ${idNumberLabel(memberType)} to make this person ${memberType}.` },
      };
    }
    return { data: null, error: { message: "Role transition failed." } };
  }
  if (!data || typeof data !== "object" || typeof (data as Record<string, unknown>).id !== "string") {
    return { data: null, error: { message: "Role transition returned unexpected data." } };
  }
  return { data, error: null };
}
