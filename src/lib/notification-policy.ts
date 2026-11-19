/**
 * Authoritative notification audience policy for the TRAC desk.
 * Unknown, null, or unclassified roles DENY (return null) — they must never
 * fall through to the staff inbox by default.
 */
import { PATRON_ROLES, PRIVILEGED_ROLES, type UserRole } from "./types";

export type NotificationAudience = "member" | "staff";

export function notificationAudienceFor(
  role: unknown
): NotificationAudience | null {
  if (typeof role !== "string") return null;
  if (PATRON_ROLES.includes(role as UserRole)) return "member";
  if (PRIVILEGED_ROLES.includes(role as UserRole)) return "staff";
  return null; // fail closed
}
