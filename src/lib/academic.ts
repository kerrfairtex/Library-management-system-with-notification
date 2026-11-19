/**
 * Server-side validation for student academic profiles.
 * Database rows are the authority; these are input-shape guards only.
 */
import type { MemberType } from "./types";

export const REQUIRED_STUDENT_FIELDS = [
  "studentId",
  "departmentId",
  "courseId",
  "yearLevel",
  "section",
] as const;

export type AcademicInput = {
  memberType: MemberType;
  studentId?: string | null;
  departmentId?: string | null;
  courseId?: string | null;
  yearLevel?: string | null;
  section?: string | null;
};

function blank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

/** Returns field names that are missing for a student; [] for non-students. */
export function missingAcademicFields(input: AcademicInput): string[] {
  if (input.memberType !== "student") return [];
  return REQUIRED_STUDENT_FIELDS.filter((field) => blank(input[field]));
}

/** True when a UUID-shaped value is supplied (IDs come from master tables). */
export function isUuid(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
  );
}

/**
 * Validates shape/deep-link membership. Reference existence is checked by the
 * database foreign keys — never trust a client-supplied name.
 */
export function validateAcademicInput(input: AcademicInput): string[] {
  if (input.memberType !== "student") return [];
  const problems = missingAcademicFields(input).map(
    (field) => `${field} is required for student members.`
  );
  if (!blank(input.departmentId) && !isUuid(input.departmentId)) {
    problems.push("departmentId must be a valid department ID.");
  }
  if (!blank(input.courseId) && !isUuid(input.courseId)) {
    problems.push("courseId must be a valid course ID.");
  }
  return problems;
}

/** Completeness audit fields for an existing student member row. */
export function profileMissingFields(row: {
  studentId?: string | null;
  departmentId?: string | null;
  courseId?: string | null;
  yearLevel?: string | null;
  section?: string | null;
}): string[] {
  return REQUIRED_STUDENT_FIELDS.filter((field) => blank(row[field]));
}
