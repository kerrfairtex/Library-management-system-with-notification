/**
 * Members page: filtering and CSV export. Pure (no React, no database), so
 * the exact rows a librarian downloads are unit-tested.
 */
import type { Member, MemberType } from "./types";

export type MemberFilters = {
  query: string;
  type: "all" | MemberType;
  departmentId: string;
  courseId: string;
  yearLevel: string;
};

export const NO_FILTERS: MemberFilters = { query: "", type: "all", departmentId: "", courseId: "", yearLevel: "" };

/** Text search covers name, email, phone, ID number and legacy grade. */
export function filterMembers(members: readonly Member[], f: MemberFilters): Member[] {
  const q = f.query.trim().toLowerCase();
  return members.filter((m) => {
    if (f.type !== "all" && m.memberType !== f.type) return false;
    if (f.departmentId && m.departmentId !== f.departmentId) return false;
    if (f.courseId && m.courseId !== f.courseId) return false;
    if (f.yearLevel && m.yearLevel !== f.yearLevel) return false;
    if (!q) return true;
    return [m.name, m.email, m.phone ?? "", m.studentId ?? "", m.grade ?? ""].some((v) =>
      v.toLowerCase().includes(q)
    );
  });
}

/**
 * One CSV cell. Quotes when needed and neutralises spreadsheet formulas:
 * a cell starting with = + - @ (or tab/CR) gets a leading apostrophe so
 * Excel/Sheets show it as text instead of running it.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const MEMBER_CSV_HEADER = [
  "Name", "Email", "Phone", "Type", "ID number", "Department", "Course", "Year level", "Section", "Active",
] as const;

/** CSV for the given (already filtered) members; codes resolved from master data. */
export function membersToCsv(
  members: readonly Member[],
  lookup: { departments: { id: string; code: string }[]; courses: { id: string; code: string }[] }
): string {
  const dept = new Map(lookup.departments.map((d) => [d.id, d.code]));
  const course = new Map(lookup.courses.map((c) => [c.id, c.code]));
  const rows = members.map((m) => [
    m.name,
    m.email,
    m.phone,
    m.memberType,
    m.studentId,
    m.departmentId ? dept.get(m.departmentId) ?? "" : "",
    m.courseId ? course.get(m.courseId) ?? "" : "",
    m.yearLevel,
    m.section,
    m.active ? "yes" : "no",
  ]);
  return [MEMBER_CSV_HEADER, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
