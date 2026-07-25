import type { PublicUser, UserRole } from "./types";

export type AppCapability =
  | "dashboard.read"
  | "books.read"
  | "books.write"
  | "members.read"
  | "members.write"
  | "loans.manage"
  | "notifications.read"
  | "staff.manage";

const roleCapabilities: Record<UserRole, readonly AppCapability[]> = {
  student: ["dashboard.read", "books.read", "notifications.read"],
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
  if (role === "admin") return "Admin";
  if (role === "librarian") return "Librarian";
  return "Student";
}
