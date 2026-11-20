"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { canAccess, roleLabel } from "@/lib/permissions";
import type { Member, MemberType, PublicUser } from "@/lib/types";
import { apiJson, useApi } from "@/lib/hooks";
import { AcademicFields, StudentIdField, type AcademicMaster } from "@/components/AcademicFields";
import { useDeskSession } from "@/components/DeskSessionProvider";
import { formatDate } from "@/lib/utils";
import { YEAR_LEVELS, coursesForDepartment } from "@/lib/academic";
import { filterMembers, membersToCsv } from "@/lib/member-export";
import { Badge, Button, Card, EmptyState, ErrorState, Modal, PageHeader, Table, useDialogs } from "@/components/ui";

// Force dynamic rendering - this page needs session and database access
export const dynamic = "force-dynamic";

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  memberType: "student" as MemberType,
  studentId: "",
  grade: "",
  departmentId: "",
  courseId: "",
  yearLevel: "",
  section: "",
};


const typeFilters: Array<"all" | MemberType> = ["all", "student", "faculty", "teacher", "staff", "community"];

function typeLabel(type: MemberType): string {
  if (type === "student") return "Student";
  if (type === "staff") return "Staff";
  if (type === "faculty") return "Faculty";
  if (type === "teacher") return "Teacher";
  return "Community";
}

export default function MembersPage() {
  const { session: me } = useDeskSession();
  const { data, loading, error, reload } = useApi<Member[]>("/api/members");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | MemberType>("all");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const dialogs = useDialogs();
  const [master, setMaster] = useState<AcademicMaster>({ departments: [], courses: [] });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/academic")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data && !cancelled) setMaster(data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const canManageMembers = canAccess(me?.user, "members.write");
  // Deleting a member is admin-only; librarians register and edit patrons.
  const canDeleteMembers = canAccess(me?.user, "staff.manage");
  const canViewMembers = canAccess(me?.user, "members.read");

  // Deep link from the completeness audit: /members?edit=<memberId>.
  // Open the matching record once the list is loaded. State updates happen
  // in a microtask, never synchronously in the effect body.
  useEffect(() => {
    if (typeof window === "undefined" || !data || !canManageMembers) return;
    const editId = new URLSearchParams(window.location.search).get("edit");
    if (!editId) return;
    const target = data.find((m) => m.id === editId);
    if (!target) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setEditing(target);
      setForm({
        name: target.name, email: target.email, phone: target.phone,
        memberType: target.memberType, studentId: target.studentId ?? "",
        grade: target.grade ?? "", departmentId: target.departmentId ?? "",
        courseId: target.courseId ?? "", yearLevel: target.yearLevel ?? "",
        section: target.section ?? "",
      });
      setFormError(null);
      setOpen(true);
      window.history.replaceState({}, "", window.location.pathname);
    });
    return () => { cancelled = true; };
  }, [data, canManageMembers]);

  const members = useMemo(
    () =>
      filterMembers(data ?? [], {
        query,
        type: typeFilter,
        departmentId: departmentFilter,
        courseId: courseFilter,
        yearLevel: yearFilter,
      }),
    [data, query, typeFilter, departmentFilter, courseFilter, yearFilter]
  );
  const filterCourses = coursesForDepartment(master.courses, departmentFilter);
  const deptCode = useMemo(() => new Map(master.departments.map((d) => [d.id, d.code])), [master]);
  const courseCode = useMemo(() => new Map(master.courses.map((c) => [c.id, c.code])), [master]);
  const filtersActive = Boolean(query || typeFilter !== "all" || departmentFilter || courseFilter || yearFilter);

  function clearFilters() {
    setQuery("");
    setTypeFilter("all");
    setDepartmentFilter("");
    setCourseFilter("");
    setYearFilter("");
  }

  /** Downloads exactly the rows on screen (the filtered list). */
  function downloadCsv() {
    const csv = membersToCsv(members, master);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `members-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  // Restricted view rendered after all hooks (rules of hooks): the previous
  // early return before useMemo crashed React when session data arrived late.
  const restrictedView = Boolean(me) && !canViewMembers;

  function openCreate() {
    if (!canManageMembers) return;
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setOpen(true);
  }

  function openEdit(member: Member) {
    if (!canManageMembers) return;
    setEditing(member);
    setForm({
      name: member.name,
      email: member.email,
      phone: member.phone,
      memberType: member.memberType,
      studentId: member.studentId ?? "",
      grade: member.grade ?? "",
      departmentId: member.departmentId ?? "",
      courseId: member.courseId ?? "",
      yearLevel: member.yearLevel ?? "",
      section: member.section ?? "",
    });
    setFormError(null);
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canManageMembers) return;
    setBusy(true);
    setFormError(null);
    const payload = {
      name: form.name,
      email: form.email,
      phone: form.phone,
      memberType: form.memberType,
      // ID number for every patron type (student, faculty, teacher, community).
      studentId: form.memberType === "staff" ? null : form.studentId,
      grade: form.memberType === "student" ? form.grade : null,
      // Students require a department; faculty/teachers may record one.
      departmentId:
        form.memberType === "student" || form.memberType === "faculty" || form.memberType === "teacher"
          ? form.departmentId || null
          : null,
      courseId: form.memberType === "student" ? form.courseId : null,
      yearLevel: form.memberType === "student" ? form.yearLevel : null,
      section: form.memberType === "student" ? form.section : null,
    };
    try {
      if (editing) {
        await apiJson(`/api/members/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiJson("/api/members", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setOpen(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(member: Member) {
    if (!canManageMembers) return;
    setActionError(null);
    try {
      await apiJson(`/api/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !member.active }),
      });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "The patron wasn’t updated. Try again.");
    }
  }

  async function onDelete(id: string) {
    if (!canDeleteMembers) return;
    const ok = await dialogs.confirm({
      title: "Remove this patron?",
      message: "Their patron record is deleted. This can’t be undone.",
      confirmLabel: "Remove patron",
      danger: true,
    });
    if (!ok) return;
    setActionError(null);
    try {
      await apiJson(`/api/members/${id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "The patron wasn’t removed. Try again.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Patrons"
        subtitle={
          restrictedView
            ? "Only librarians and admins can open the member registry."
            : canManageMembers
              ? "Register students with a student ID and grade, plus faculty, teacher, staff or community patrons."
              : "View the member registry. Only librarians and admins can add or edit members."
        }
        action={
          canManageMembers ? (
            <Button variant="primary" onClick={openCreate}>
              Add patron
            </Button>
          ) : undefined
        }
      />

      {restrictedView ? (
        <Card>
          <EmptyState
            title="Patrons are restricted"
            body={`Signed in as ${roleLabel(me!.user.role)}. You can update only your own profile.`}
          />
        </Card>
      ) : (
      <>
      <div className="panel p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            type="search"
            className="field max-w-md"
            aria-label="Search patrons"
            placeholder="Search name, email, phone or ID number"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Patron type">
            {typeFilters.map((key) => (
              <Button
                key={key}
                variant={typeFilter === key ? "primary" : "ghost"}
                aria-pressed={typeFilter === key}
                onClick={() => setTypeFilter(key)}
              >
                {key === "all" ? "All" : typeLabel(key)}
              </Button>
            ))}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto_auto] lg:items-end">
          <div>
            <label className="label" htmlFor="filter-department">Department</label>
            <select id="filter-department" className="field" value={departmentFilter}
              onChange={(e) => {
                const next = e.target.value;
                setDepartmentFilter(next);
                // Drop a course that doesn't belong to the new department.
                if (courseFilter && !coursesForDepartment(master.courses, next).some((c) => c.id === courseFilter)) {
                  setCourseFilter("");
                }
              }}>
              <option value="">All departments</option>
              {master.departments.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="filter-course">Course</label>
            <select id="filter-course" className="field" value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}>
              <option value="">All courses</option>
              {filterCourses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="filter-year">Year level</label>
            <select id="filter-year" className="field" value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}>
              <option value="">All year levels</option>
              {YEAR_LEVELS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <Button variant="ghost" onClick={clearFilters} disabled={!filtersActive}>
            Clear filters
          </Button>
          <Button variant="ghost" onClick={downloadCsv} disabled={members.length === 0}>
            Download CSV ({members.length})
          </Button>
        </div>

        {actionError && <ErrorState message={actionError} />}

        <Table
          caption="Patrons"
          columns={["Name", "Type", "ID number", "Contact", "Joined", "Status", { label: "Actions", hideLabel: true }]}
          loading={loading}
          error={error}
          onRetry={reload}
          isEmpty={members.length === 0}
          empty={{
            title: filtersActive ? "No patrons match these filters" : "No patrons yet",
            body: filtersActive ? "Clear the filters or try a different search." : "Add a patron to start lending books.",
          }}
        >
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="font-semibold">{member.name}</td>
                    <td>
                      <Badge tone={member.memberType === "student" ? "info" : "ok"}>{typeLabel(member.memberType)}</Badge>
                    </td>
                    <td>
                      {member.memberType === "student" ? (
                        <>
                          <p>{member.studentId || "—"}</p>
                          <p className="text-xs text-muted">
                            {[
                              member.departmentId ? deptCode.get(member.departmentId) : null,
                              member.courseId ? courseCode.get(member.courseId) : null,
                              member.yearLevel,
                              member.section,
                            ].filter(Boolean).join(" · ") || member.grade || "No academic details"}
                          </p>
                        </>
                      ) : member.studentId ? (
                        <>
                          <p>{member.studentId}</p>
                          {member.departmentId && deptCode.get(member.departmentId) && (
                            <p className="text-xs text-muted">
                              {deptCode.get(member.departmentId)}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-muted">
                          —
                        </span>
                      )}
                    </td>
                    <td>
                      <p>{member.email}</p>
                      <p className="text-xs text-muted">
                        {member.phone}
                      </p>
                    </td>
                    <td>{formatDate(member.joinedAt)}</td>
                    <td>
                      <Badge tone={member.active ? "ok" : "warn"}>{member.active ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-2">
                        {canManageMembers && (
                          <>
                            <Button variant="ghost" onClick={() => openEdit(member)}>
                              Edit
                            </Button>
                            <Button variant="ghost" onClick={() => toggleActive(member)}>
                              {member.active ? "Deactivate" : "Activate"}
                            </Button>
                            {canDeleteMembers && (
                              <Button variant="danger" onClick={() => onDelete(member.id)}>
                                Delete
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
        </Table>
      </div>

      <Modal
        open={open && canManageMembers}
        title={editing ? "Edit patron" : "Add patron"}
        onClose={() => setOpen(false)}
      >
        <form className="space-y-3" onSubmit={onSubmit}>
          {formError && <ErrorState message={formError} />}
          <div>
            <label className="label" htmlFor="memberType">
              Patron type
            </label>
            <select
              id="memberType"
              className="field"
              value={form.memberType}
              // Linked to a login account: the category follows the account
              // role, which is changed in Administration.
              disabled={Boolean(editing?.userId)}
              title={editing?.userId ? "Linked to a login account. Change the role in Administration." : undefined}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  memberType: e.target.value as MemberType,
                }))
              }
            >
              <option value="student">Student</option>
              <option value="faculty">Faculty</option>
              <option value="teacher">Teacher</option>
              <option value="staff">Staff</option>
              <option value="community">Community</option>
            </select>
          </div>
          {(
            [
              ["name", "Full name"],
              ["email", "Email"],
              ["phone", "Phone"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="label" htmlFor={key}>
                {label}
              </label>
              <input
                id={key}
                className="field"
                required
                type={key === "email" ? "email" : "text"}
                readOnly={key === "email" && Boolean(editing?.userId)}
                title={key === "email" && editing?.userId ? "Sign-in email of a linked account; not editable here." : undefined}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          {form.memberType === "student" && (
            <>
              <StudentIdField value={form.studentId}
                onChange={(studentId) => setForm((f) => ({ ...f, studentId }))} />
              <AcademicFields mode="student" master={master} value={form}
                onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
              <div>
                <label className="label" htmlFor="grade">
                  Legacy grade / class
                </label>
                <input
                  id="grade"
                  className="field"
                  value={form.grade}
                  onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
                  placeholder="Historical value only — not the year level"
                />
              </div>
            </>
          )}
          {(form.memberType === "faculty" || form.memberType === "teacher") && (
            <AcademicFields mode="department" master={master} value={form}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
          )}
          {form.memberType !== "student" && (
            <StudentIdField memberType={form.memberType} value={form.studentId}
              onChange={(studentId) => setForm((f) => ({ ...f, studentId }))} />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" busy={busy} busyLabel="Saving…">
              Save patron
            </Button>
          </div>
        </form>
      </Modal>
      {dialogs.element}
      </>
      )}
    </div>
  );
}
