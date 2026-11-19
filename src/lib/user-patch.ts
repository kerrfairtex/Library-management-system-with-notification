/**
 * Decision path for PATCH /api/users/[id].
 * Pure with respect to I/O: every mutation is injected, so the REAL production
 * decision (validate -> classify -> reject-or-mutate) can be unit tested
 * without a database. The route passes the real mutators.
 */
import {
  describeOpenLoansTypeChangeProblem,
  describePasswordProblem,
  describeRoleChangeProblem,
  describeStatusTransitionProblem,
  isUserRole,
  isUserStatus,
} from "./staff-rules";
import {
  describeIdNumberProblems,
  idNumberLabel,
  isIdNumberRequired,
  normalizeIdNumber,
  sharesIdNumberKind,
} from "./academic";
import { memberTypeForRole } from "./role-transition";
import type { PublicUser, UserRole, UserStatus } from "./types";

export type MutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; httpStatus?: number }
  // Narrowed failure type used after the `!result.ok` guard below.
  ;
type FailedResult = Extract<MutationResult<unknown>, { ok: false }>;

export type UserPatchDeps = {
  actor: PublicUser;
  target: PublicUser;
  body: Record<string, unknown>;
  countAdmins: () => Promise<number>;
  /** true when a non-admin tries to assign a privileged role. */
  privilegedAssignmentDenied: (actorRole: UserRole, nextRole: UserRole) => boolean;
  mutateProfile: (updates: { name?: string; password?: string }) => Promise<PublicUser | null>;
  mutateStatus: (nextStatus: UserStatus, studentActivation: boolean) => Promise<MutationResult<PublicUser>>;
  /** idNumber: the new ID entered with the role change, or null to keep/clear per the rule. */
  mutateRole: (nextRole: UserRole, idNumber: string | null) => Promise<MutationResult<PublicUser>>;
  /** Open loans of the target's linked member; checked when the role changes its member type. */
  countOpenLoans: () => Promise<number>;
};

export type ApplyPatchResult =
  | { kind: "error"; status: number; error: string; log?: string }
  | { kind: "success"; data: unknown };

const MIXED_ERROR =
  "Role and status changes must be submitted without name or password changes.";

export async function applyUserPatch(deps: UserPatchDeps): Promise<ApplyPatchResult> {
  const { actor, target, body } = deps;
  const hasRole = body.role !== undefined;
  const hasStatus = body.status !== undefined;
  const hasProfile = body.name !== undefined || body.password !== undefined;

  // 1. Reject unsupported combinations BEFORE any mutation or count query.
  if ((hasRole || hasStatus) && hasProfile) {
    return { kind: "error", status: 400, error: MIXED_ERROR };
  }
  if (!hasRole && !hasStatus && !hasProfile) {
    return { kind: "error", status: 400, error: "Nothing to update." };
  }
  if (hasRole && hasStatus) {
    return {
      kind: "error", status: 400,
      error: "Role and status cannot be changed in the same request.",
    };
  }

  // 2. Validate name/password (no mutation yet).
  const updates: { name?: string; password?: string } = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return { kind: "error", status: 400, error: "Name cannot be empty." };
    updates.name = name;
  }
  if (body.password !== undefined) {
    const password = String(body.password);
    const problem = describePasswordProblem(password);
    if (problem) return { kind: "error", status: 400, error: problem };
    updates.password = password;
  }

  // 3. Validate role.
  if (hasRole) {
    if (!isUserRole(body.role)) {
      return {
        kind: "error", status: 400,
        error: "Role must be student, faculty, teacher, community, librarian, or admin.",
      };
    }
    const nextRole = body.role as UserRole;
    if (deps.privilegedAssignmentDenied(actor.role, nextRole)) {
      return { kind: "error", status: 403, error: "Only an admin can assign privileged roles." };
    }
    const problem = describeRoleChangeProblem({
      actorId: actor.id,
      target,
      nextRole,
      adminCount: await deps.countAdmins(),
    });
    if (problem) return { kind: "error", status: 409, error: problem };

    // 3b. ID number for the new member type. A Student ID is not an Employee
    // ID, so changing to a type that needs a different kind of ID must come
    // with the new ID; faculty <-> teacher keep theirs (checked again in SQL).
    const nextType = memberTypeForRole(nextRole);
    const entered = normalizeIdNumber(body.studentId);
    if (entered) {
      const idProblems = describeIdNumberProblems(nextType, entered);
      if (idProblems.length > 0) return { kind: "error", status: 400, error: idProblems.join(" ") };
    } else if (
      target.role !== nextRole &&
      isIdNumberRequired(nextType) &&
      !sharesIdNumberKind(memberTypeForRole(target.role), nextType)
    ) {
      return {
        kind: "error", status: 400,
        error: `Enter the ${idNumberLabel(nextType)} to make this person ${nextType}.`,
      };
    }
  }

  // 3c. No member type change while books are out.
  if (hasRole) {
    const nextRole = body.role as UserRole;
    if (memberTypeForRole(target.role) !== memberTypeForRole(nextRole)) {
      const problem = describeOpenLoansTypeChangeProblem(await deps.countOpenLoans());
      if (problem) return { kind: "error", status: 409, error: problem };
    }
  }

  // 4. Validate status.
  if (hasStatus) {
    if (!isUserStatus(body.status)) {
      return { kind: "error", status: 400, error: "Status must be pending or active." };
    }
    const nextStatus = body.status as UserStatus;
    const problem = describeStatusTransitionProblem({
      actorId: actor.id,
      target,
      nextStatus,
      adminCount: await deps.countAdmins(),
    });
    if (problem) return { kind: "error", status: 409, error: problem };
  }

  // 5. Exactly one mutation path, chosen before any write.
  if (hasStatus) {
    const studentActivation = body.status === "active" && target.role === "student";
    const result = await deps.mutateStatus(body.status as UserStatus, studentActivation);
    if (!result.ok) {
      const failure = result as FailedResult;
      return {
        kind: "error", status: failure.httpStatus ?? 409, error: failure.error,
        log: "Status transition rejected: " + failure.error,
      };
    }
    return { kind: "success", data: result.data };
  }
  if (hasRole) {
    const result = await deps.mutateRole(body.role as UserRole, normalizeIdNumber(body.studentId));
    if (!result.ok) {
      const failure = result as FailedResult;
      return {
        kind: "error", status: 409, error: failure.error,
        log: "Atomic role transition failed: " + failure.error,
      };
    }
    return { kind: "success", data: result.data };
  }
  const updated = await deps.mutateProfile(updates);
  if (!updated) return { kind: "error", status: 404, error: "Staff account not found." };
  return { kind: "success", data: updated };
}
