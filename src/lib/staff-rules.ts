import { PATRON_ROLES, type PublicUser, type UserRole, type UserStatus } from "./types";

export const MIN_PASSWORD_LENGTH = 8;

const USER_ROLES: readonly UserRole[] = [
  "student", "faculty", "teacher", "community", "librarian", "admin",
];

export function isUserRole(value: unknown): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}

export function isUserStatus(value: unknown): value is UserStatus {
  return value === "pending" || value === "active";
}

/** Only an admin may assign privileged roles; callers enforce admin gate too. */
export function describeRoleAssignmentProblem({
  actorRole,
  nextRole,
}: {
  actorRole: UserRole;
  nextRole: UserRole;
}): string | null {
  if (actorRole === "admin") return null;
  if (nextRole === "admin" || nextRole === "librarian") {
    return "Only an admin can assign privileged roles.";
  }
  return null;
}

/**
 * Who may create or edit which ACCOUNT. An admin can do everything. A
 * librarian may create and edit patron accounts (student, faculty, teacher,
 * community) but may not touch librarian/admin accounts, nor move anyone
 * into or out of those roles. Everyone else is refused.
 *
 * `targetRole` is the account's current role (omit when creating);
 * `nextRole` is the role being created or assigned (omit when unchanged).
 */
export function describeAccountManagementProblem({
  actorRole,
  targetRole,
  nextRole,
}: {
  actorRole: UserRole;
  targetRole?: UserRole;
  nextRole?: UserRole;
}): string | null {
  if (actorRole === "admin") return null;
  if (actorRole !== "librarian") return "Only librarians and admins can manage accounts.";
  if (targetRole !== undefined && !PATRON_ROLES.includes(targetRole)) {
    return "Only an admin can edit librarian or admin accounts.";
  }
  if (nextRole !== undefined && !PATRON_ROLES.includes(nextRole)) {
    return "Only an admin can assign privileged roles.";
  }
  return null;
}

/**
 * Passwords that are published in this repository (README, seed scripts) or
 * are among the most common ones. An account using any of them is effectively
 * public, so they are refused whenever a password is set or changed.
 */
const BLOCKED_PASSWORDS = new Set([
  "admin123", "librarian123", "student123",
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwerty123", "qwertyuiop", "11111111", "00000000", "iloveyou", "abc12345",
  "admin1234", "welcome1", "library123", "changeme", "change-me-in-production",
]);

export function describePasswordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 128) {
    return "Password must be at most 128 characters.";
  }
  if (BLOCKED_PASSWORDS.has(password.toLowerCase()) || /^(.)\1+$/.test(password)) {
    return "That password is too common or publicly known. Choose a different one.";
  }
  return null;
}

/**
 * Guards against an admin locking every admin out of staff management. Only an
 * admin can reach these operations, so the danger is not privilege escalation
 * but leaving the library with nobody able to assign roles.
 */
export function describeRoleChangeProblem({
  actorId,
  target,
  nextRole,
  adminCount,
}: {
  actorId: string;
  target: PublicUser;
  nextRole: UserRole;
  adminCount: number;
}): string | null {
  if (target.role === nextRole) return null;
  const isAdminDemotion = target.role === "admin" && nextRole !== "admin";
  if (!isAdminDemotion) return null;

  if (target.id === actorId) {
    return "You cannot remove your own admin role. Ask another admin to do it.";
  }
  if (adminCount <= 1) {
    return "The library needs at least one admin. Promote someone else first.";
  }
  return null;
}

export function describeDeleteProblem({
  actorId,
  target,
  adminCount,
}: {
  actorId: string;
  target: PublicUser;
  adminCount: number;
}): string | null {
  if (target.id === actorId) {
    return "You cannot delete your own account.";
  }
  if (target.role === "admin" && adminCount <= 1) {
    return "The library needs at least one admin.";
  }
  return null;
}

/**
 * Membership verification gate: an admin approves or rejects pending
 * self-sign-ups, but never flips their own status (that would let an admin
 * lock themselves out of nothing meaningful, but it keeps the audit line
 * clean — status changes come from another account).
 */
export function describeStatusChangeProblem({
  actorId,
  target,
}: {
  actorId: string;
  target: PublicUser;
}): string | null {
  if (target.id === actorId) {
    return "You cannot change your own verification status.";
  }
  return null;
}

/**
 * Prevents the final ACTIVE administrator from being moved into a non-active
 * state by another administrator. Self-changes are already blocked separately.
 */
export function describeStatusTransitionProblem({
  actorId,
  target,
  nextStatus,
  adminCount,
}: {
  actorId: string;
  target: PublicUser;
  nextStatus: UserStatus;
  adminCount: number;
}): string | null {
  const selfProblem = describeStatusChangeProblem({ actorId, target });
  if (selfProblem) return selfProblem;
  const deactivatingAdmin =
    target.role === "admin" && target.status === "active" && nextStatus !== "active";
  if (deactivatingAdmin && adminCount <= 1) {
    return "The library needs at least one active admin. Promote someone else first.";
  }
  return null;
}
