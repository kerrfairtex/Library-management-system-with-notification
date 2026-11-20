"use client";

/*
 * Administration → Departments & courses. Admin-only master data editor:
 * add departments/courses, rename, deactivate/reactivate, and set which
 * department offers each course. Once a course has a department, the
 * student forms only offer it under that department and the server rejects
 * any other combination (src/lib/academic.ts).
 */
import { useState, type FormEvent } from "react";
import { apiJson, useApi } from "@/lib/hooks";
import type { Course, Department } from "@/lib/types";
import { ErrorState } from "@/components/ui";
import { MAX_PROGRAM_YEARS } from "@/lib/academic";

const YEAR_CHOICES = Array.from({ length: MAX_PROGRAM_YEARS }, (_, i) => i + 1);

type MasterData = { departments: Department[]; courses: Course[]; mismatchedStudents?: number };

export function AcademicSetup() {
  const { data, loading, error, reload } = useApi<MasterData>("/api/academic?all=1");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [dept, setDept] = useState({ code: "", name: "" });
  const [course, setCourse] = useState({ code: "", name: "", departmentId: "", programYears: "" });

  async function send(method: "POST" | "PATCH", body: Record<string, unknown>) {
    setBusy(true);
    setProblem(null);
    try {
      await apiJson("/api/academic", { method, body: JSON.stringify(body) });
      await reload();
      return true;
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Save failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addDepartment(e: FormEvent) {
    e.preventDefault();
    if (await send("POST", { kind: "department", ...dept })) setDept({ code: "", name: "" });
  }

  async function addCourse(e: FormEvent) {
    e.preventDefault();
    if (await send("POST", {
      kind: "course",
      code: course.code,
      name: course.name,
      departmentId: course.departmentId || null,
      programYears: course.programYears ? Number(course.programYears) : null,
    })) {
      setCourse({ code: "", name: "", departmentId: "", programYears: "" });
    }
  }

  async function rename(kind: "department" | "course", row: { id: string; name: string }) {
    const name = window.prompt(`New display name for ${row.name}`, row.name);
    if (name && name.trim() && name.trim() !== row.name) await send("PATCH", { kind, id: row.id, name: name.trim() });
  }

  const departments = data?.departments ?? [];
  const courses = data?.courses ?? [];
  const deptCode = (id: string | null) => departments.find((d) => d.id === id)?.code;

  return (
    <section className="panel p-4 md:p-5 space-y-4" aria-labelledby="academic-setup">
      <div>
        <h2 id="academic-setup" className="display text-2xl">Departments &amp; courses</h2>
        <p className="text-sm opacity-75">
          Used when adding students. Set each course&apos;s department so a student can only be placed in a course
          their department offers, and its length so only valid year levels appear (a 4-year program offers 1st&ndash;4th
          Year, plus Irregular and Graduate Student). Deactivate instead of deleting; existing student records keep
          their values.
        </p>
      </div>
      {error && <ErrorState message={error} />}
      {problem && <ErrorState message={problem} />}
      {data?.mismatchedStudents ? (
        <p className="badge tone-warn" role="status">
          {data.mismatchedStudents} student record(s) have a course from a different department. Fix them in Patrons.
        </p>
      ) : null}
      {loading && <p className="text-sm">Loading…</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="font-semibold">Departments</h3>
          <form onSubmit={addDepartment} className="flex flex-wrap gap-2">
            <input className="field" style={{ flex: "1 1 6rem" }} required placeholder="Code (e.g. ICS)" aria-label="Department code"
              value={dept.code} onChange={(e) => setDept((d) => ({ ...d, code: e.target.value }))} />
            <input className="field" style={{ flex: "2 1 10rem" }} placeholder="Full name (optional)" aria-label="Department name"
              value={dept.name} onChange={(e) => setDept((d) => ({ ...d, name: e.target.value }))} />
            <button className="btn btn-primary" disabled={busy}>Add</button>
          </form>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Code</th><th>Name</th><th>Status</th><th /></tr></thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.id}>
                    <td className="font-semibold">{d.code}</td>
                    <td>{d.name}</td>
                    <td><span className={`badge ${d.active ? "tone-ok" : "tone-warn"}`}>{d.active ? "Active" : "Inactive"}</span></td>
                    <td className="whitespace-nowrap">
                      <button className="btn btn-ghost" disabled={busy} onClick={() => rename("department", d)}>Rename</button>{" "}
                      <button className="btn btn-ghost" disabled={busy}
                        onClick={() => send("PATCH", { kind: "department", id: d.id, active: !d.active })}>
                        {d.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold">Courses / programs</h3>
          <form onSubmit={addCourse} className="flex flex-wrap gap-2">
            <input className="field" style={{ flex: "1 1 6rem" }} required placeholder="Code (e.g. BSIT)" aria-label="Course code"
              value={course.code} onChange={(e) => setCourse((c) => ({ ...c, code: e.target.value }))} />
            <input className="field" style={{ flex: "2 1 10rem" }} placeholder="Full name (optional)" aria-label="Course name"
              value={course.name} onChange={(e) => setCourse((c) => ({ ...c, name: e.target.value }))} />
            <select className="field" style={{ flex: "1 1 8rem" }} aria-label="Course department"
              value={course.departmentId} onChange={(e) => setCourse((c) => ({ ...c, departmentId: e.target.value }))}>
              <option value="">Any department</option>
              {departments.filter((d) => d.active).map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
            </select>
            <select className="field" style={{ flex: "1 1 6rem" }} aria-label="Program length"
              value={course.programYears} onChange={(e) => setCourse((c) => ({ ...c, programYears: e.target.value }))}>
              <option value="">Length not set</option>
              {YEAR_CHOICES.map((n) => <option key={n} value={n}>{n} years</option>)}
            </select>
            <button className="btn btn-primary" disabled={busy}>Add</button>
          </form>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Code</th><th>Department</th><th>Years</th><th>Status</th><th /></tr></thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td className="font-semibold" title={c.name}>{c.code}</td>
                    <td>
                      <select className="field" aria-label={`Department for ${c.code}`} disabled={busy}
                        value={c.departmentId ?? ""}
                        onChange={(e) => send("PATCH", { kind: "course", id: c.id, departmentId: e.target.value || null })}>
                        <option value="">Any department</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>{d.code}{d.active ? "" : " (inactive)"}</option>
                        ))}
                      </select>
                      {c.departmentId && !deptCode(c.departmentId) ? <span className="text-xs"> unknown</span> : null}
                    </td>
                    <td>
                      <select className="field" aria-label={`Program length for ${c.code}`} disabled={busy}
                        value={c.programYears ?? ""}
                        onChange={(e) => send("PATCH", { kind: "course", id: c.id, programYears: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">Not set</option>
                        {YEAR_CHOICES.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td><span className={`badge ${c.active ? "tone-ok" : "tone-warn"}`}>{c.active ? "Active" : "Inactive"}</span></td>
                    <td className="whitespace-nowrap">
                      <button className="btn btn-ghost" disabled={busy} onClick={() => rename("course", c)}>Rename</button>{" "}
                      <button className="btn btn-ghost" disabled={busy}
                        onClick={() => send("PATCH", { kind: "course", id: c.id, active: !c.active })}>
                        {c.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
