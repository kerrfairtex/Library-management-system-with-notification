"use client";

import { useMemo, useState, type FormEvent } from "react";
import { roleLabel } from "@/lib/permissions";
import type { PublicUser, UserRole } from "@/lib/types";
import { apiJson, useApi } from "@/lib/hooks";
import { MIN_PASSWORD_LENGTH } from "@/lib/staff-rules";
import { EmptyState, ErrorBanner, Modal, PageHeader } from "@/components/ui";

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "student" as UserRole,
};

const roleBlurbs: Record<UserRole, string> = {
  admin: "Full system control: users, roles, books, members, and circulation.",
  librarian: "Can manage books and circulation, but not users or member records.",
  student: "Read-only account for dashboard, catalog, alerts, and personal profile.",
};

function roleBlurb(role: UserRole): string {
  return roleBlurbs[role];
}

export default function StaffPage() {
  const { data: me } = useApi<{ user: PublicUser }>("/api/auth/me");
  const isAdmin = me?.user?.role === "admin";

  const { data, loading, error, reload } = useApi<PublicUser[]>(
    isAdmin ? "/api/users" : null
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PublicUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const staff = useMemo(() => data ?? [], [data]);
  const adminCount = staff.filter((person) => person.role === "admin").length;

  if (me && !isAdmin) {
    return (
      <div>
        <PageHeader
          title="User accounts"
          subtitle="Only an admin can create accounts and assign student, librarian, or admin access."
        />
        <div className="panel p-4 md:p-5">
          <EmptyState
            title="Admins only"
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
    setForm({ name: person.name, email: person.email, password: "", role: person.role });
    setFormError(null);
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      if (editing) {
        const body: Record<string, unknown> = { name: form.name, role: form.role };
        if (form.password) body.password = form.password;
        await apiJson(`/api/users/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await apiJson("/api/users", {
          method: "POST",
          body: JSON.stringify(form),
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

  async function changeRole(person: PublicUser, role: UserRole) {
    try {
      await apiJson(`/api/users/${person.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      await reload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not change role");
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
      subtitle="Create accounts, assign the student/librarian/admin role, and control sign-in access."
        action={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
          Add user
          </button>
        }
      />

      <div className="panel p-4 md:p-5">
        {error && <ErrorBanner message={error} />}
        {loading && <p className="text-sm">Loading staff…</p>}

        {!loading && staff.length === 0 ? (
          <EmptyState title="No user accounts" body="Add a student, librarian, or admin to get started." />
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
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => openEdit(person)}
                          >
                            Edit
                          </button>
                          {person.role === "librarian" ? (
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
                          {person.role !== "student" && (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => changeRole(person, "student")}
                            >
                              Make student
                            </button>
                          )}
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
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
            >
              <option value="student">Student</option>
              <option value="librarian">Librarian</option>
              <option value="admin">Admin</option>
            </select>
            <p className="mt-1 text-xs text-[color-mix(in_srgb,var(--ink)_50%,transparent)]">
              {roleBlurb(form.role)}
            </p>
          </div>

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
