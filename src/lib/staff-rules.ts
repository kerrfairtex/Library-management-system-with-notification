import type { PublicUser, UserRole } from "./types";

export const MIN_PASSWORD_LENGTH = 8;

export function isUserRole(value: unknown): value is UserRole {
  return value === "student" || value === "admin" || value === "librarian";
}

export function describePasswordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
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
