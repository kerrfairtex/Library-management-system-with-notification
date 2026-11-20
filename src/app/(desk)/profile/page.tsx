"use client";

import { useState, type FormEvent } from "react";
import { isPatron, roleLabel } from "@/lib/permissions";
import type { PublicUser } from "@/lib/types";
import { apiJson, useApi } from "@/lib/hooks";
import { useDeskSession } from "@/components/DeskSessionProvider";
import { MIN_PASSWORD_LENGTH } from "@/lib/staff-rules";
import { ErrorState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { profileDetailRows, type OwnMemberDetails } from "@/lib/profile-details";
import type { AcademicMaster } from "@/components/AcademicFields";

// Force dynamic rendering - this page needs session and database access
export const dynamic = "force-dynamic";

type ProfileUser = PublicUser & { createdAt: string };

export default function ProfilePage() {
  const { session: data, reload } = useDeskSession();
  const user = data?.user as ProfileUser | undefined;
  // The server-rendered session has no createdAt; /api/auth/me does.
  const account = useApi<{ user: ProfileUser }>("/api/auth/me");
  const memberSince = account.data?.user?.createdAt;
  const patron = isPatron(user);
  const ownMember = useApi<{ member: OwnMemberDetails | null }>(patron ? "/api/auth/me/member" : null);
  const master = useApi<AcademicMaster>(patron ? "/api/academic" : null);
  const detailRows = profileDetailRows(ownMember.data?.member, master.data ?? { departments: [], courses: [] });

  const [nameForm, setNameForm] = useState({ name: "", busy: false, error: null as string | null, success: false });
  const [pwForm, setPwForm] = useState({ password: "", confirm: "", busy: false, error: null as string | null, success: false });

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setNameForm((f) => ({ ...f, busy: true, error: null, success: false }));
    try {
      await apiJson("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ name: nameForm.name }),
      });
      setNameForm((f) => ({ ...f, busy: false, success: true }));
      await reload();
    } catch (err) {
      setNameForm((f) => ({
        ...f,
        busy: false,
        error: err instanceof Error ? err.message : "Save failed.",
      }));
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (pwForm.password !== pwForm.confirm) {
      setPwForm((f) => ({ ...f, error: "Passwords do not match.", success: false }));
      return;
    }
    setPwForm((f) => ({ ...f, busy: true, error: null, success: false }));
    try {
      await apiJson("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ password: pwForm.password }),
      });
      setPwForm({ password: "", confirm: "", busy: false, error: null, success: true });
    } catch (err) {
      setPwForm((f) => ({
        ...f,
        busy: false,
        error: err instanceof Error ? err.message : "Save failed.",
      }));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My profile"
        subtitle="View your account details and update your name or password."
      />

      {/* Account info card */}
      <div className="panel p-5">
        <h2 className="display mb-4 text-2xl">Account details</h2>
        {user ? (
          <dl className="grid gap-y-3 sm:grid-cols-[160px_1fr]">
            <dt className="text-sm font-semibold text-muted">Name</dt>
            <dd className="text-sm">{user.name}</dd>

            <dt className="text-sm font-semibold text-muted">Email</dt>
            <dd className="text-sm">{user.email}</dd>

            <dt className="text-sm font-semibold text-muted">Role</dt>
            <dd>
              <span className={`badge ${user.role === "admin" ? "tone-info" : "tone-ok"}`}>
                {roleLabel(user.role)}
              </span>
            </dd>

            <dt className="text-sm font-semibold text-muted">Member since</dt>
            <dd className="text-sm">{account.loading ? "…" : formatDate(memberSince)}</dd>

            {detailRows.map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-sm font-semibold text-muted">{row.label}</dt>
                <dd className={`text-sm ${row.value === "Not set" ? "text-muted" : ""}`}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm">Loading…</p>
        )}
        {patron && (ownMember.loading || master.loading) && (
          <div className="mt-3 space-y-2" aria-busy="true" aria-label="Loading academic details">
            <div className="skeleton h-4 w-56 max-w-full" />
            <div className="skeleton h-4 w-44 max-w-full" />
          </div>
        )}
        {patron && (ownMember.error || master.error) && (
          <div className="mt-3">
            <ErrorState message={ownMember.error || master.error || "Failed to load academic details."} />
          </div>
        )}
        {detailRows.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            Ask the library desk to correct your ID or academic details.
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Change name */}
        <div className="panel p-5">
          <h2 className="display mb-4 text-2xl">Change display name</h2>
          <form className="space-y-3" onSubmit={saveName}>
            {nameForm.error && <ErrorState message={nameForm.error} />}
            {nameForm.success && (
              <p className="rounded-xl bg-[var(--jade-soft,#e6f4ef)] px-4 py-3 text-sm text-[var(--jade)]">
                Name updated successfully.
              </p>
            )}
            <div>
              <label className="label" htmlFor="display-name">
                New name
              </label>
              <input
                id="display-name"
                className="field"
                required
                placeholder={user?.name ?? "Full name"}
                value={nameForm.name}
                onChange={(e) =>
                  setNameForm((f) => ({ ...f, name: e.target.value, success: false }))
                }
              />
            </div>
            <div className="flex justify-end">
              <button type="submit" className="btn btn-primary" disabled={nameForm.busy}>
                {nameForm.busy ? "Saving…" : "Save name"}
              </button>
            </div>
          </form>
        </div>

        {/* Change password */}
        <div className="panel p-5">
          <h2 className="display mb-4 text-2xl">Change password</h2>
          <form className="space-y-3" onSubmit={savePassword}>
            {pwForm.error && <ErrorState message={pwForm.error} />}
            {pwForm.success && (
              <p className="rounded-xl bg-[var(--jade-soft,#e6f4ef)] px-4 py-3 text-sm text-[var(--jade)]">
                Password changed successfully.
              </p>
            )}
            <div>
              <label className="label" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                className="field"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={pwForm.password}
                onChange={(e) =>
                  setPwForm((f) => ({ ...f, password: e.target.value, success: false }))
                }
              />
              <p className="mt-1 text-xs text-muted">
                At least {MIN_PASSWORD_LENGTH} characters.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="confirm-password">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                className="field"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={pwForm.confirm}
                onChange={(e) =>
                  setPwForm((f) => ({ ...f, confirm: e.target.value, success: false }))
                }
              />
            </div>
            <div className="flex justify-end">
              <button type="submit" className="btn btn-primary" disabled={pwForm.busy}>
                {pwForm.busy ? "Saving…" : "Change password"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
