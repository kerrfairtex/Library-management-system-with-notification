import type { PublicUser, UserRole } from "./types";

export type AppCapability =
  | "dashboard.read"
  | "loans.read.own"
  | "holds.place"
  | "books.read"
  | "books.write"
  | "members.read"
  | "members.write"
  | "loans.manage"
  | "notifications.read"
  | "staff.manage";

const roleCapabilities: Record<UserRole, readonly AppCapability[]> = {
  student: ["dashboard.read", "books.read", "notifications.read", "loans.read.own", "holds.place"],
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
