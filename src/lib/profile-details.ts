/**
 * Read-only academic details shown on My profile. Pure: takes the caller's
 * own member fields (from /api/auth/me) plus master data, returns label/value
 * rows. Which rows appear depends on the member type.
 */
import { DEPARTMENT_MEMBER_TYPES, acceptsIdNumber, idNumberLabel } from "./academic";
import type { Member, MemberType } from "./types";

export type OwnMemberDetails = Pick<
  Member,
  "memberType" | "studentId" | "departmentId" | "courseId" | "yearLevel" | "section"
>;

type Ref = { id: string; code: string; name?: string };

const NOT_SET = "Not set";

function refLabel(rows: readonly Ref[], id: string | null): string {
  if (!id) return NOT_SET;
  const row = rows.find((r) => r.id === id);
  if (!row) return "Unavailable";
  return row.name && row.name !== row.code ? `${row.name} (${row.code})` : row.code;
}

/** Fields only a student has. */
const STUDENT_ONLY: readonly MemberType[] = ["student"];

export function profileDetailRows(
  member: OwnMemberDetails | null | undefined,
  master: { departments: readonly Ref[]; courses: readonly Ref[] }
): { label: string; value: string }[] {
  if (!member) return [];
  const t = member.memberType;
  const rows: { label: string; value: string }[] = [];
  if (acceptsIdNumber(t)) rows.push({ label: idNumberLabel(t), value: member.studentId?.trim() || NOT_SET });
  if (DEPARTMENT_MEMBER_TYPES.includes(t)) rows.push({ label: "Department", value: refLabel(master.departments, member.departmentId) });
  if (STUDENT_ONLY.includes(t)) {
    rows.push({ label: "Course", value: refLabel(master.courses, member.courseId) });
    rows.push({ label: "Year level", value: member.yearLevel?.trim() || NOT_SET });
    rows.push({ label: "Section", value: member.section?.trim() || NOT_SET });
  }
  return rows;
}
