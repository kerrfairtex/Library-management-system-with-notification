"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Member } from "@/lib/types";
import { apiJson, useApi } from "@/lib/hooks";
import { formatDate } from "@/lib/utils";
import { EmptyState, ErrorBanner, Modal, PageHeader } from "@/components/ui";

const emptyForm = { name: "", email: "", phone: "" };

export default function MembersPage() {
  const { data, loading, error, reload } = useApi<Member[]>("/api/members");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const members = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((m) => {
      if (!q) return true;
      return [m.name, m.email, m.phone].some((v) => v.toLowerCase().includes(q));
    });
  }, [data, query]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setOpen(true);
  }

  function openEdit(member: Member) {
    setEditing(member);
    setForm({ name: member.name, email: member.email, phone: member.phone });
    setFormError(null);
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      if (editing) {
        await apiJson(`/api/members/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
      } else {
        await apiJson("/api/members", {
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

  async function toggleActive(member: Member) {
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
        title="Members"
        subtitle="Register patrons and keep contact details ready for circulation."
        action={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            Add member
          </button>
        }
      />

      <div className="panel p-4 md:p-5">
        <div className="mb-4">
          <input
            className="field max-w-md"
            placeholder="Search name, email, or phone"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {error && <ErrorBanner message={error} />}
        {loading && <p className="text-sm">Loading members…</p>}

        {!loading && members.length === 0 ? (
          <EmptyState title="No members found" body="Register a patron to start lending." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
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
        open={open}
        title={editing ? "Edit member" : "Add member"}
        onClose={() => setOpen(false)}
      >
        <form className="space-y-3" onSubmit={onSubmit}>
          {formError && <ErrorBanner message={formError} />}
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
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save member"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
