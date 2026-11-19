"use client";

/*
 * Department/College → Course/Program → Year level dropdowns, shared by the
 * Administration (add account) and Patrons (add member) forms.
 *
 *  - Courses are filtered to the chosen department (plus courses with no
 *    department set); the course list is disabled until a department is
 *    picked.
 *  - Year levels follow the course's program length (4-year → 1st-4th Year),
 *    plus Irregular and Graduate Student.
 *  - Changing a parent clears a child that is no longer valid.
 * The server re-checks every rule (src/lib/academic.ts), so this is guidance,
 * not the enforcement point.
 */
import { DEFAULT_SECTIONS, coursesForDepartment, yearLevelsForProgram } from "@/lib/academic";

export type AcademicMaster = {
  departments: { id: string; code: string; name?: string }[];
  courses: { id: string; code: string; name?: string; departmentId?: string | null; programYears?: number | null }[];
};

export type AcademicValue = {
  departmentId: string;
  courseId: string;
  yearLevel: string;
  section: string;
};

const label = (row: { code: string; name?: string }) =>
  row.name && row.name !== row.code ? `${row.name} (${row.code})` : row.code;

export function AcademicFields({
  master,
  value,
  onChange,
  mode,
}: {
  master: AcademicMaster;
  value: AcademicValue;
  onChange: (patch: Partial<AcademicValue>) => void;
  /** "student": all four fields required. "department": optional department only (faculty/teacher). */
  mode: "student" | "department";
}) {
  const required = mode === "student";
  const courses = coursesForDepartment(master.courses, value.departmentId);
  const course = master.courses.find((c) => c.id === value.courseId);
  const years = yearLevelsForProgram(course?.programYears);

  function pickDepartment(departmentId: string) {
    const still = coursesForDepartment(master.courses, departmentId).some((c) => c.id === value.courseId);
    onChange(still ? { departmentId } : { departmentId, courseId: "", yearLevel: "" });
  }

  function pickCourse(courseId: string) {
    const next = master.courses.find((c) => c.id === courseId);
    const keepYear = yearLevelsForProgram(next?.programYears).includes(value.yearLevel);
    onChange(keepYear ? { courseId } : { courseId, yearLevel: "" });
  }

  const department = (
    <div>
      <label className="label" htmlFor="departmentId">Department / College{required ? " *" : " (optional)"}</label>
      <select id="departmentId" className="field" required={required} value={value.departmentId}
        onChange={(e) => pickDepartment(e.target.value)}>
        <option value="">{required ? "Select department" : "None"}</option>
        {master.departments.map((d) => <option key={d.id} value={d.id}>{label(d)}</option>)}
      </select>
    </div>
  );
  if (mode === "department") return department;

  return (
    <>
      {department}
      <div>
        <label className="label" htmlFor="courseId">Course / Program *</label>
        <select id="courseId" className="field" required value={value.courseId}
          disabled={!value.departmentId} onChange={(e) => pickCourse(e.target.value)}>
          <option value="">{value.departmentId ? "Select course" : "Select a department first"}</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
        </select>
        {value.departmentId && courses.length === 0 && (
          <p className="text-xs" style={{ marginTop: "0.25rem" }}>
            No active course is assigned to this department yet. An admin can map courses in Administration → Departments &amp; courses.
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="yearLevel">Year level *</label>
          <select id="yearLevel" className="field" required value={value.yearLevel}
            disabled={!value.courseId} onChange={(e) => onChange({ yearLevel: e.target.value })}>
            <option value="">{value.courseId ? "Select year level" : "Select a course first"}</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="section">Section *</label>
          <select id="section" className="field" required value={value.section}
            onChange={(e) => onChange({ section: e.target.value })}>
            <option value="">Select section</option>
            {/* Keep a legacy value selectable when editing an older record. */}
            {value.section && !(DEFAULT_SECTIONS as readonly string[]).includes(value.section) && (
              <option value={value.section}>{value.section}</option>
            )}
            {DEFAULT_SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
    </>
  );
}

/** Student ID Number input: text (leading zeros kept), never auto-generated. */
export function StudentIdField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label" htmlFor="studentId">Student ID Number *</label>
      <input id="studentId" className="field" required type="text" inputMode="text" autoComplete="off"
        spellCheck={false} maxLength={30} pattern="[A-Za-z0-9][A-Za-z0-9\-\/.]{2,29}"
        placeholder="Enter official student ID" value={value} onChange={(e) => onChange(e.target.value)} />
      <p className="text-xs" style={{ marginTop: "0.25rem" }}>
        Must be unique. Saved exactly as typed, leading zeros included (example format only: 2026-00125).
      </p>
    </div>
  );
}
