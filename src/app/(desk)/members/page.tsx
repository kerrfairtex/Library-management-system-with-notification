"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { canAccess, roleLabel } from "@/lib/permissions";
import type { Member, MemberType, PublicUser } from "@/lib/types";
import { apiJson, useApi } from "@/lib/hooks";
import { formatDate } from "@/lib/utils";
import { EmptyState, ErrorBanner, Modal, PageHeader } from "@/components/ui";

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  memberType: "student" as MemberType,
  studentId: "",
  grade: "",
};

const typeFilters: Array<"all" | MemberType> = ["all", "student", "staff", "community"];

function typeLabel(type: MemberType): string {
  if (type === "student") return "Student";
  if (type === "staff") return "Staff";
  return "Community";
}

export default function MembersPage() {
  const { data: me } = useApi<{ user: PublicUser }>("/api/auth/me");
  const { data, loading, error, reload } = useApi<Member[]>("/api/members");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | MemberType>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canManageMembers = canAccess(me?.user, "members.write");
  const canViewMembers = canAccess(me?.user, "members.read");

  useEffect(() => {
    if (!canManageMembers) setOpen(false);
  }, [canManageMembers]);

  if (me && !canViewMembers) {
    return (
      <div>
        <PageHeader
          title="Students & members"
          subtitle="Only librarians and admins can open the member registry."
        />
        <div className="panel p-4 md:p-5">
          <EmptyState
            title="Members are restricted"
            body={`Signed in as ${roleLabel(me.user.role)}. You can update only your own profile.`}
          />
        </div>
      </div>
    );
  }

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
          canManageMembers
            ? "Register students with a student ID and grade, plus staff or community patrons."
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
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  memberType: e.target.value as MemberType,
                }))
              }
            >
              <option value="student">Student</option>
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
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          {form.memberType === "student" && (
            <>
              <div>
                <label className="label" htmlFor="studentId">
                  Student ID
                </label>
                <input
                  id="studentId"
                  className="field"
                  required
                  value={form.studentId}
                  onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))}
                  placeholder="e.g. STU-2026-0142"
                />
              </div>
              <div>
                <label className="label" htmlFor="grade">
                  Grade / class
                </label>
                <input
                  id="grade"
                  className="field"
                  value={form.grade}
                  onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
                  placeholder="e.g. Grade 10 / Year 2"
                />
              </div>
            </>
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
    </div>
  );
}
