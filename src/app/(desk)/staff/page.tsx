"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { canAccess, isPatron, roleLabel } from "@/lib/permissions";
import type { PublicUser, UserRole } from "@/lib/types";
import { apiJson, useApi } from "@/lib/hooks";
import { useDeskSession } from "@/components/DeskSessionProvider";
import { MIN_PASSWORD_LENGTH } from "@/lib/staff-rules";
import { EmptyState, ErrorBanner, Modal, PageHeader } from "@/components/ui";
import { AcademicSetup } from "@/components/AcademicSetup";
import { AcademicFields, StudentIdField, type AcademicMaster } from "@/components/AcademicFields";
import { acceptsIdNumber, idNumberLabel, isIdNumberRequired, sharesIdNumberKind } from "@/lib/academic";
import { memberTypeForRole } from "@/lib/role-transition";

// Force dynamic rendering - this page needs session and database access
export const dynamic = "force-dynamic";

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "student" as UserRole,
  phone: "",
  studentId: "",
  departmentId: "",
  courseId: "",
  yearLevel: "",
  section: "",
};

const academicRoles: UserRole[] = ["student", "faculty", "teacher", "community"];
const allRoles: UserRole[] = [...academicRoles, "librarian", "admin"];

const roleBlurbs: Record<UserRole, string> = {
  admin: "Full control, including staff accounts, roles and settings.",
  librarian: "Runs the desk and registers patrons. Cannot manage staff accounts.",
  student: "Borrows books. Needs a Student ID, department, course, year and section.",
  faculty: "Borrows books. Needs an Employee/Faculty ID.",
  teacher: "Borrows books. Needs an Employee/Faculty ID.",
  community: "Borrows books. ID presented is optional.",
};

function roleBlurb(role: UserRole): string {
  return roleBlurbs[role];
}

/**
 * True when changing `from` -> `to` needs a new ID number entered: the new
 * type uses a different kind of ID (a Student ID is not an Employee ID).
 * Faculty <-> teacher keep theirs. Mirrors the server rule.
 */
function roleChangeNeedsId(from: UserRole, to: UserRole): boolean {
  const next = memberTypeForRole(to);
  return from !== to && acceptsIdNumber(next) && !sharesIdNumberKind(memberTypeForRole(from), next);
}

export default function StaffPage() {
  const { session: me } = useDeskSession();
  const isAdmin = me?.user?.role === "admin";
  // Librarians manage patron accounts only; the API enforces the same scope.
  const canManageAccounts = canAccess(me?.user, "members.write");
  const roleOptions = isAdmin ? allRoles : academicRoles;
  const canEditPerson = (person: PublicUser) => isAdmin || isPatron(person);

  const { data, loading, error, reload } = useApi<PublicUser[]>(
    canManageAccounts ? "/api/users" : null
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PublicUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [master, setMaster] = useState<AcademicMaster>({ departments: [], courses: [] });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/academic")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !cancelled) setMaster(data);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const staff = useMemo(() => data ?? [], [data]);
  const adminCount = staff.filter((person) => person.role === "admin").length;

  // Edit modal: a staff account only moves between librarian and admin, and
  // nobody changes their own role or demotes the last admin from here.
  const editingSelf = Boolean(editing && editing.id === me?.user?.id);
  const editingLastAdmin = editing?.role === "admin" && adminCount <= 1;
  const roleLocked = editingSelf || editingLastAdmin;
  const editRoleOptions: UserRole[] =
    editing && !isPatron(editing) ? ["librarian", "admin"] : roleOptions;
  const pending = useMemo(() => staff.filter((p) => p.status === "pending"), [staff]);

  if (me && !canManageAccounts) {
    return (
      <div>
        <PageHeader
          title="User accounts"
          subtitle="Librarians and admins create and manage sign-in accounts."
        />
        <div className="panel p-4 md:p-5">
          <EmptyState
            title="Librarians and admins only"
            body="Ask an admin to change your role if you need to manage user accounts."
          />
        </div>
      </div>
    );
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setOpen(true);
  }

  function openEdit(person: PublicUser) {
    setEditing(person);
    setForm({
      name: person.name, email: person.email, password: "", role: person.role, phone: "",
      studentId: "", departmentId: "", courseId: "", yearLevel: "", section: "",
    });
    setFormError(null);
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      if (editing) {
        // The API takes profile changes and a role change as separate
        // requests, so send each only when it actually changed.
        const profile: Record<string, unknown> = {};
        if (form.name.trim() !== editing.name) profile.name = form.name;
        if (form.password) profile.password = form.password;
        if (Object.keys(profile).length > 0) {
          await apiJson(`/api/users/${editing.id}`, {
            method: "PATCH",
            body: JSON.stringify(profile),
          });
        }
        if (form.role !== editing.role) {
          const roleBody: Record<string, unknown> = { role: form.role };
          if (roleChangeNeedsId(editing.role, form.role) && form.studentId.trim()) {
            roleBody.studentId = form.studentId;
          }
          await apiJson(`/api/users/${editing.id}`, {
            method: "PATCH",
            body: JSON.stringify(roleBody),
          });
        }
      } else {
        // Send only the academic fields the chosen role uses.
        const body: Record<string, unknown> = {
          name: form.name, email: form.email, password: form.password, role: form.role,
        };
        if (academicRoles.includes(form.role) && form.phone.trim()) body.phone = form.phone;
        if (form.role === "student") {
          Object.assign(body, {
            studentId: form.studentId, departmentId: form.departmentId, courseId: form.courseId,
            yearLevel: form.yearLevel, section: form.section,
          });
        } else if (academicRoles.includes(form.role)) {
          // Faculty/teacher need an Employee/Faculty ID; community's is optional.
          if (form.studentId.trim()) body.studentId = form.studentId;
          if ((form.role === "faculty" || form.role === "teacher") && form.departmentId) {
            body.departmentId = form.departmentId;
          }
        }
        await apiJson("/api/users", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      setOpen(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
      // An edit is up to two requests (profile, then role); if the second
      // fails the first may already be saved, so refresh the list.
      void reload();
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(person: PublicUser, role: UserRole) {
    const body: Record<string, unknown> = { role };
    const next = memberTypeForRole(role);
    if (roleChangeNeedsId(person.role, role) && isIdNumberRequired(next)) {
      const entered = window.prompt(`Enter ${person.name}'s ${idNumberLabel(next)} exactly as issued.`);
      if (entered === null) return;
      body.studentId = entered;
    }
    try {
      await apiJson(`/api/users/${person.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await reload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not change role");
    }
  }

  async function approvePending(person: PublicUser) {
    try {
      await apiJson(`/api/users/${person.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      });
      await reload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not approve account");
    }
  }

  async function onDelete(person: PublicUser) {
    if (!window.confirm(`Remove ${person.name}'s access?`)) return;
    try {
      await apiJson(`/api/users/${person.id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div>
      <PageHeader
      title="User accounts"
      subtitle={
        isAdmin
          ? "Create accounts, assign roles, and control sign-in access."
          : "Create and edit patron accounts: students, faculty, teachers and community members."
      }
        action={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
          Add user
          </button>
        }
      />

      <div className="panel p-4 md:p-5">
        {error && <ErrorBanner message={error} />}
        {loading && <p className="text-sm">Loading staff…</p>}

        {!loading && pending.length > 0 && (
          <section className="mb-6 space-y-3">
            <div>
              <h2 className="display text-xl">Pending verifications</h2>
              <p className="mt-1 text-sm text-[color-mix(in_srgb,var(--ink)_60%,transparent)]">
                These accounts signed up with Google and are waiting for
                librarian review before they can use the desk.
              </p>
            </div>
            {pending.map((person) => (
              <div
                key={person.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] px-4 py-3"
              >
                <div>
                  <p className="font-semibold">{person.name}</p>
                  <p className="text-xs text-[color-mix(in_srgb,var(--ink)_55%,transparent)]">
                    {person.email} · {person.role}
                  </p>
                </div>
                {canEditPerson(person) && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => approvePending(person)}
                    >
                      Approve
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => onDelete(person)}
                      >
                        Reject
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {!loading && staff.length === 0 ? (
          <EmptyState title="No user accounts" body="Add a student, faculty member, teacher or community member to get started." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((person) => {
                  const isSelf = person.id === me?.user?.id;
                  const lastAdmin = person.role === "admin" && adminCount <= 1;
                  return (
                    <tr key={person.id}>
                      <td className="font-semibold">
                        {person.name}
                        {person.status === "pending" && (
                          <span className="badge tone-warn ml-2">pending</span>
                        )}
                        {isSelf && (
                          <span className="ml-2 text-xs font-normal text-[color-mix(in_srgb,var(--ink)_50%,transparent)]">
                            you
                          </span>
                        )}
                      </td>
                      <td>{person.email}</td>
                      <td>
                        <span
                          className={`badge ${person.role === "admin" ? "tone-info" : "tone-ok"}`}
                        >
                          {roleLabel(person.role)}
                        </span>
                        <p className="mt-1 text-xs text-[color-mix(in_srgb,var(--ink)_50%,transparent)]">
                          {roleBlurb(person.role)}
                        </p>
                      </td>
                      <td>
                        {canEditPerson(person) && (
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => openEdit(person)}
                          >
                            Edit
                          </button>
                          {!isAdmin ? null : person.role === "librarian" ? (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => changeRole(person, "admin")}
                            >
                              Make admin
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => changeRole(person, "librarian")}
                              disabled={isSelf || lastAdmin}
                              title={
                                isSelf
                                  ? "Another admin has to change your role"
                                  : lastAdmin
                                    ? "The library needs at least one admin"
                                    : undefined
                              }
                            >
                              Make librarian
                            </button>
                          )}
                          {isPatron(person) && academicRoles
                            .filter((r) => r !== person.role)
                            .map((r) => (
                              <button key={r} type="button" className="btn btn-ghost"
                                onClick={() => changeRole(person, r)}
                                disabled={isSelf || lastAdmin}
                                title={
                                  isSelf
                                    ? "Another admin has to change your role"
                                    : lastAdmin
                                      ? "The library needs at least one admin"
                                      : undefined
                                }>
                                Make {r}
                              </button>
                            ))}
                          {isAdmin && (
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => onDelete(person)}
                            disabled={isSelf || lastAdmin}
                            title={
                              isSelf
                                ? "You cannot delete your own account"
                                : lastAdmin
                                  ? "The library needs at least one admin"
                                  : undefined
                            }
                          >
                            Delete
                          </button>
                          )}
                        </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isAdmin && <AcademicSetup />}

      <Modal
        open={open}
        title={editing ? `Edit ${editing.name}` : "Add user"}
        onClose={() => setOpen(false)}
      >
        <form className="space-y-3" onSubmit={onSubmit}>
          {formError && <ErrorBanner message={formError} />}

          <div>
            <label className="label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              className="field"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="field"
              type="email"
              required
              disabled={Boolean(editing)}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            {editing && (
              <p className="mt-1 text-xs text-[color-mix(in_srgb,var(--ink)_50%,transparent)]">
                Email is how this person signs in and cannot be changed here.
              </p>
            )}
          </div>

          <div>
            <label className="label" htmlFor="role">
              Role
            </label>
            <select
              id="role"
              className="field"
              value={form.role}
              disabled={roleLocked}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
            >
              {editRoleOptions.map((r) => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </select>
            {roleLocked && (
              <p className="mt-1 text-xs text-[color-mix(in_srgb,var(--ink)_50%,transparent)]">
                {editingSelf
                  ? "Another admin has to change your role."
                  : "The library needs at least one admin, so this role can't change."}
              </p>
            )}
            <p className="mt-1 text-xs text-[color-mix(in_srgb,var(--ink)_50%,transparent)]">
              {roleBlurb(form.role)}
            </p>
          </div>

          {!editing && academicRoles.includes(form.role) && (
            <div>
              <label className="label" htmlFor="phone">Phone (optional)</label>
              <input
                id="phone"
                className="field"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={20}
                placeholder="0917 123 4567"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
          )}

          {(isAdmin || !editing) && (
          <div>
            <label className="label" htmlFor="password">
              {editing ? "New password (optional)" : "Password"}
            </label>
            <input
              id="password"
              className="field"
              type="password"
              required={!editing}
              minLength={MIN_PASSWORD_LENGTH}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder={editing ? "Leave blank to keep the current one" : ""}
            />
            <p className="mt-1 text-xs text-[color-mix(in_srgb,var(--ink)_50%,transparent)]">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          </div>
          )}


          {editing && roleChangeNeedsId(editing.role, form.role) && (
            <StudentIdField memberType={memberTypeForRole(form.role)} value={form.studentId}
              onChange={(studentId) => setForm((f) => ({ ...f, studentId }))} />
          )}
          {editing && isPatron(form.role) && (
            <p className="text-xs text-[color-mix(in_srgb,var(--ink)_50%,transparent)]">
              Edit ID numbers and academic details on the Members page.
            </p>
          )}
          {form.role === "student" && !editing && (
            <div className="space-y-3 rounded-lg border border-[var(--line)] p-3">
              <p className="text-xs font-semibold">Student information (required)</p>
              <StudentIdField value={form.studentId}
                onChange={(studentId) => setForm((f) => ({ ...f, studentId }))} />
              <AcademicFields mode="student" master={master} value={form}
                onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
            </div>
          )}
          {(form.role === "faculty" || form.role === "teacher") && !editing && (
            <div className="space-y-3 rounded-lg border border-[var(--line)] p-3">
              <p className="text-xs font-semibold">{roleLabel(form.role)} information</p>
              <StudentIdField memberType={form.role} value={form.studentId}
                onChange={(studentId) => setForm((f) => ({ ...f, studentId }))} />
              <AcademicFields mode="department" master={master} value={form}
                onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
            </div>
          )}
          {form.role === "community" && !editing && (
            <StudentIdField memberType="community" value={form.studentId}
              onChange={(studentId) => setForm((f) => ({ ...f, studentId }))} />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save changes" : "Create account"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
