"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { canAccess, roleLabel } from "@/lib/permissions";
import type { Member, MemberType, PublicUser } from "@/lib/types";
import { apiJson, useApi } from "@/lib/hooks";
import { AcademicFields, StudentIdField, type AcademicMaster } from "@/components/AcademicFields";
import { useDeskSession } from "@/components/DeskSessionProvider";
import { formatDate } from "@/lib/utils";
import { EmptyState, ErrorBanner, Modal, PageHeader } from "@/components/ui";

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
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
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

  const members = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((m) => {
      if (typeFilter !== "all" && m.memberType !== typeFilter) return false;
      if (!q) return true;
      return [m.name, m.email, m.phone, m.studentId ?? "", m.grade ?? ""].some((v) =>
        v.toLowerCase().includes(q)
      );
    });
  }, [data, query, typeFilter]);

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
      studentId: form.memberType === "student" ? form.studentId : null,
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
    try {
      await apiJson(`/api/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !member.active }),
      });
      await reload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function onDelete(id: string) {
    if (!canManageMembers) return;
    if (!window.confirm("Remove this member?")) return;
    try {
      await apiJson(`/api/members/${id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Students & members"
        subtitle={
          restrictedView
            ? "Only librarians and admins can open the member registry."
            : canManageMembers
              ? "Register students with a student ID and grade, plus faculty, teacher, staff or community patrons."
              : "View the member registry. Only admins can add, edit, activate, or delete members."
        }
        action={
          canManageMembers ? (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              Add student / member
            </button>
          ) : undefined
        }
      />

      {restrictedView ? (
        <div className="panel p-4 md:p-5">
          <EmptyState
            title="Members are restricted"
            body={`Signed in as ${roleLabel(me!.user.role)}. You can update only your own profile.`}
          />
        </div>
      ) : (
      <>
      <div className="panel p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            className="field max-w-md"
            placeholder="Search name, email, phone, student ID, or grade"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {typeFilters.map((key) => (
              <button
                key={key}
                type="button"
                className={`btn ${typeFilter === key ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setTypeFilter(key)}
              >
                {key === "all" ? "All" : typeLabel(key)}
              </button>
            ))}
          </div>
        </div>

        {error && <ErrorBanner message={error} />}
        {loading && <p className="text-sm">Loading members…</p>}

        {!loading && members.length === 0 ? (
          <EmptyState
            title="No students or members found"
            body="Add a student to start lending books."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Student details</th>
                  <th>Contact</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="font-semibold">{member.name}</td>
                    <td>
                      <span
                        className={`badge ${
                          member.memberType === "student" ? "tone-info" : "tone-ok"
                        }`}
                      >
                        {typeLabel(member.memberType)}
                      </span>
                    </td>
                    <td>
                      {member.memberType === "student" ? (
                        <>
                          <p>{member.studentId || "—"}</p>
                          <p className="text-xs text-[color-mix(in_srgb,var(--ink)_50%,transparent)]">
                            {member.grade || "No grade set"}
                          </p>
                        </>
                      ) : (
                        <span className="text-[color-mix(in_srgb,var(--ink)_45%,transparent)]">
                          —
                        </span>
                      )}
                    </td>
                    <td>
                      <p>{member.email}</p>
                      <p className="text-xs text-[color-mix(in_srgb,var(--ink)_50%,transparent)]">
                        {member.phone}
                      </p>
                    </td>
                    <td>{formatDate(member.joinedAt)}</td>
                    <td>
                      <span className={`badge ${member.active ? "tone-ok" : "tone-warn"}`}>
                        {member.active ? "active" : "inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="flex justify-end gap-2">
                        {canManageMembers && (
                          <>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => openEdit(member)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => toggleActive(member)}
                            >
                              {member.active ? "Deactivate" : "Activate"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger"
                              onClick={() => onDelete(member.id)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={open && canManageMembers}
        title={editing ? "Edit member" : "Add student / member"}
        onClose={() => setOpen(false)}
      >
        <form className="space-y-3" onSubmit={onSubmit}>
          {formError && <ErrorBanner message={formError} />}
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
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : form.memberType === "student" ? "Save student" : "Save member"}
            </button>
          </div>
        </form>
      </Modal>
      </>
      )}
    </div>
  );
}
