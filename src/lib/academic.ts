/**
 * Academic data model for TRAC accounts and members.
 *   Department/College → Course/Program (course.departmentId) → Year level
 *   (limited by course.programYears). Students need all of it; faculty and
 *   teachers may record a department; other categories carry none.
 * Database rows are the authority; these are input-shape guards plus pure
 * rules shared by the forms and the server.
 */
import type { MemberType } from "./types";

export const REQUIRED_STUDENT_FIELDS = [
  "studentId",
  "departmentId",
  "courseId",
  "yearLevel",
  "section",
] as const;

/** Ordinal year levels; a program of N years offers the first N. */
export const ORDINAL_YEAR_LEVELS = ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year", "6th Year"] as const;
/** Offered for every program regardless of length. */
export const SPECIAL_YEAR_LEVELS = ["Irregular", "Graduate Student"] as const;
/** Every year level a student record may hold. */
export const YEAR_LEVELS = [...ORDINAL_YEAR_LEVELS, ...SPECIAL_YEAR_LEVELS] as const;
/** Member categories that may record a department (faculty/teacher: optional). */
export const DEPARTMENT_MEMBER_TYPES: readonly MemberType[] = ["student", "faculty", "teacher"];
export const MAX_PROGRAM_YEARS = ORDINAL_YEAR_LEVELS.length;

/**
 * Year levels to offer for a course. programYears = null (length not set)
 * offers every ordinal year; 4 offers 1st-4th Year. Irregular and Graduate
 * Student are always available.
 */
export function yearLevelsForProgram(programYears: number | null | undefined): string[] {
  const n =
    typeof programYears === "number" && Number.isInteger(programYears) && programYears >= 1 && programYears <= MAX_PROGRAM_YEARS
      ? programYears
      : MAX_PROGRAM_YEARS;
  return [...ORDINAL_YEAR_LEVELS.slice(0, n), ...SPECIAL_YEAR_LEVELS];
}

/** Valid program length: integer 1-6, or null for "not set". */
export function isValidProgramYears(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_PROGRAM_YEARS);
}
/** Default section choices in the forms; the server accepts any short code. */
export const DEFAULT_SECTIONS = ["A", "B", "C", "D"] as const;
const SECTION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 -]{0,9}$/;
const STUDENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\-/.]{2,29}$/;

/** Thrown for caller mistakes; API routes map it to HTTP 400 (or 409). */
export class InputError extends Error {
  constructor(message: string, readonly status: 400 | 409 = 400) {
    super(message);
    this.name = "InputError";
  }
}

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
  if (input.memberType !== "student") {
    const problems: string[] = [];
    // Faculty/teachers may carry an optional department; validate its shape.
    if (DEPARTMENT_MEMBER_TYPES.includes(input.memberType) && !blank(input.departmentId) && !isUuid(input.departmentId)) {
      problems.push("departmentId must be a valid department ID.");
    }
    problems.push(...idNumberProblems(input.memberType, input.studentId));
    return problems;
  }
  const problems = missingAcademicFields(input).map(
    (field) => `${field} is required for student members.`
  );
  if (!blank(input.departmentId) && !isUuid(input.departmentId)) {
    problems.push("departmentId must be a valid department ID.");
  }
  if (!blank(input.courseId) && !isUuid(input.courseId)) {
    problems.push("courseId must be a valid course ID.");
  }
  if (!blank(input.studentId) && !STUDENT_ID_PATTERN.test(String(input.studentId).trim())) {
    problems.push("Student ID Number must be 3-30 letters, digits, '-', '/' or '.' (kept exactly as typed, leading zeros included).");
  }
  if (!blank(input.yearLevel) && !(YEAR_LEVELS as readonly string[]).includes(String(input.yearLevel).trim())) {
    problems.push(`yearLevel must be one of: ${YEAR_LEVELS.join(", ")}.`);
  }
  if (!blank(input.section) && !SECTION_PATTERN.test(String(input.section).trim())) {
    problems.push("section must be a short code (1-10 letters, digits, spaces or '-').");
  }
  return problems;
}

/*
 * ID numbers. One column, members.student_id, holds the official ID for every
 * patron type (student ID, employee/faculty ID, or the ID a community member
 * presented). It is unique per member type, case-insensitive, and always
 * stored as trimmed text so leading zeros survive ("00125" stays "00125").
 * Staff member rows carry no ID.
 */

/** Member types whose ID number is mandatory. */
export const ID_REQUIRED_MEMBER_TYPES: readonly MemberType[] = ["student", "faculty", "teacher"];
/** Member types that may record an ID number at all. */
export const ID_MEMBER_TYPES: readonly MemberType[] = ["student", "faculty", "teacher", "community"];

const ID_LABELS: Record<MemberType, string> = {
  student: "Student ID",
  faculty: "Employee/Faculty ID",
  teacher: "Employee/Faculty ID",
  community: "ID presented",
  staff: "ID number",
};

export function idNumberLabel(memberType: MemberType): string {
  return ID_LABELS[memberType] ?? "ID number";
}

export function isIdNumberRequired(memberType: MemberType): boolean {
  return ID_REQUIRED_MEMBER_TYPES.includes(memberType);
}

export function acceptsIdNumber(memberType: MemberType): boolean {
  return ID_MEMBER_TYPES.includes(memberType);
}

/** Trimmed text, or null when blank. Never coerced to a number. */
export function normalizeIdNumber(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Comparison key used for uniqueness (matches the DB index). */
export function idNumberKey(value: string): string {
  return value.trim().toLowerCase();
}

/** Required/format checks for a non-student ID (students use the full student rules). */
function idNumberProblems(memberType: MemberType, value: unknown): string[] {
  if (!acceptsIdNumber(memberType)) return [];
  const id = normalizeIdNumber(value);
  const label = idNumberLabel(memberType);
  if (!id) {
    return isIdNumberRequired(memberType) ? [`${label} is required for ${memberType} members.`] : [];
  }
  if (!STUDENT_ID_PATTERN.test(id)) {
    return [`${label} must be 3-30 letters, digits, '-', '/' or '.' (kept exactly as typed, leading zeros included).`];
  }
  return [];
}

/** The 409 message for an ID already used by another member of the same type. */
export function duplicateIdNumberMessage(memberType: MemberType): string {
  return `A ${memberType} with this ID number already exists.`;
}

/**
 * Pure duplicate check: true when another member of the SAME type already
 * holds this ID (case-insensitive, trimmed). The same ID may exist under a
 * different type, e.g. student "00125" and faculty "00125".
 */
export function hasIdNumberConflict(
  existing: readonly { id: string; memberType: MemberType; idNumber: string | null }[],
  candidate: { memberType: MemberType; idNumber: string | null; exceptMemberId?: string }
): boolean {
  if (!candidate.idNumber) return false;
  const key = idNumberKey(candidate.idNumber);
  return existing.some(
    (row) =>
      row.id !== candidate.exceptMemberId &&
      row.memberType === candidate.memberType &&
      row.idNumber !== null &&
      idNumberKey(row.idNumber) === key
  );
}

/** Master-data rows as needed for reference checks. */
export type DepartmentRef = { id: string; code: string; active: boolean };
export type CourseRef = {
  id: string;
  code: string;
  active: boolean;
  departmentId: string | null;
  programYears?: number | null;
};

/**
 * Checks that the chosen department and course exist, are active (unless the
 * member already had that exact value — historical records stay editable),
 * and that the course is offered by the chosen department. A course with no
 * department set is treated as shared across departments.
 */
export function academicReferenceProblems(
  chosen: { departmentId: string | null; courseId: string | null; yearLevel?: string | null },
  found: { department: DepartmentRef | null; course: CourseRef | null },
  current: { departmentId: string | null; courseId: string | null } = { departmentId: null, courseId: null },
  departmentCodeOf: (id: string) => string | undefined = () => undefined
): string[] {
  const problems: string[] = [];
  const { department, course } = found;
  if (chosen.departmentId) {
    if (!department) problems.push("Selected department does not exist.");
    else if (!department.active && chosen.departmentId !== current.departmentId) {
      problems.push(`Department ${department.code} is inactive.`);
    }
  }
  if (chosen.courseId) {
    if (!course) problems.push("Selected course does not exist.");
    else {
      if (!course.active && chosen.courseId !== current.courseId) {
        problems.push(`Course ${course.code} is inactive.`);
      }
      if (course.departmentId && chosen.departmentId && course.departmentId !== chosen.departmentId) {
        const owner = departmentCodeOf(course.departmentId);
        problems.push(
          `Course ${course.code} belongs to ${owner ? `department ${owner}` : "another department"}` +
            `${department ? `, not ${department.code}` : ""}.`
        );
      }
      if (chosen.yearLevel && !yearLevelsForProgram(course.programYears).includes(chosen.yearLevel)) {
        problems.push(
          `${course.code} is a ${course.programYears}-year program; ${chosen.yearLevel} is not available.`
        );
      }
    }
  }
  return problems;
}

/** Courses to offer in a form once a department is picked. */
export function coursesForDepartment<T extends { departmentId?: string | null }>(
  courses: readonly T[],
  departmentId: string
): T[] {
  return courses.filter((c) => !c.departmentId || !departmentId || c.departmentId === departmentId);
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
