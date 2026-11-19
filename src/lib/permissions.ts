import { PATRON_ROLES, type PublicUser, type UserRole } from "./types";

export type AppCapability =
  | "dashboard.read"
  | "holds.place"
  | "books.read"
  | "books.write"
  | "members.read"
  | "members.write"
  | "loans.manage"
  | "loans.request"
  | "notifications.read"
  | "staff.manage";

const patronCapabilities: readonly AppCapability[] = [
  "dashboard.read",
  "books.read",
  "notifications.read",
  "holds.place",
  "loans.request",
];

const roleCapabilities: Record<UserRole, readonly AppCapability[]> = {
  student: patronCapabilities,
  faculty: patronCapabilities,
  teacher: patronCapabilities,
  community: patronCapabilities,
  librarian: [
    "dashboard.read",
    "books.read",
    "books.write",
    "members.read",
    "loans.manage",
    "notifications.read",
  ],
  admin: [
    "dashboard.read",
    "books.read",
    "books.write",
    "members.read",
    "members.write",
    "loans.manage",
    "notifications.read",
    "staff.manage",
  ],
};

const roleLabels: Record<UserRole, string> = {
  student: "Student",
  faculty: "Faculty",
  teacher: "Teacher",
  community: "Community",
  librarian: "Librarian",
  admin: "Admin",
};

function roleOf(actor: UserRole | Pick<PublicUser, "role">): UserRole {
  return typeof actor === "string" ? actor : actor.role;
}

export function canAccess(
  actor: UserRole | Pick<PublicUser, "role"> | null | undefined,
  capability: AppCapability
): boolean {
  if (!actor) return false;
  return roleCapabilities[roleOf(actor)].includes(capability);
}

export function roleLabel(role: UserRole): string {
  return roleLabels[role];
}

export function roleDashboardTitle(role: UserRole): string {
  return `${roleLabel(role)} dashboard`;
}

/**
 * True for library patrons (student, faculty, teacher, community). Patrons may
 * only ever see or act on their OWN member record. Use this instead of
 * `role === "student"`: every patron role shares the same self-service scope,
 * and unknown roles are never patrons (they fail closed to the staff checks,
 * which then require an explicit capability).
 */
export function isPatron(actor: UserRole | Pick<PublicUser, "role"> | null | undefined): boolean {
  if (!actor) return false;
  return PATRON_ROLES.includes(roleOf(actor));
}
