"use client";

import { useState, type FormEvent } from "react";
import { isPatron, roleLabel } from "@/lib/permissions";
import type { PublicUser } from "@/lib/types";
import { apiJson, useApi } from "@/lib/hooks";
import { useDeskSession } from "@/components/DeskSessionProvider";
import { MIN_PASSWORD_LENGTH } from "@/lib/staff-rules";
import { Badge, Button, Card, ErrorState, FormField, Notice, PageHeader } from "@/components/ui";
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
      <PageHeader title="My profile" subtitle="Your account details. Update your name or password here." />

      <Card title="Account details">
        {user ? (
          <dl className="grid gap-y-3 sm:grid-cols-[160px_1fr]">
            <dt className="text-muted text-sm font-semibold">Name</dt>
            <dd className="text-sm">{user.name}</dd>

            <dt className="text-muted text-sm font-semibold">Email</dt>
            <dd className="break-words text-sm">{user.email}</dd>

            <dt className="text-muted text-sm font-semibold">Role</dt>
            <dd>
              <Badge tone={user.role === "admin" ? "info" : "ok"}>{roleLabel(user.role)}</Badge>
            </dd>

            <dt className="text-muted text-sm font-semibold">Member since</dt>
            <dd className="text-sm">{account.loading ? "…" : formatDate(memberSince)}</dd>

            {detailRows.map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-muted text-sm font-semibold">{row.label}</dt>
                <dd className={`text-sm ${row.value === "Not set" ? "text-muted" : ""}`}>{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="space-y-2" aria-busy="true" aria-label="Loading account details">
            <div className="skeleton h-4 w-56 max-w-full" />
            <div className="skeleton h-4 w-44 max-w-full" />
          </div>
        )}
        {patron && (ownMember.loading || master.loading) && (
          <div className="mt-3 space-y-2" aria-busy="true" aria-label="Loading academic details">
            <div className="skeleton h-4 w-56 max-w-full" />
            <div className="skeleton h-4 w-44 max-w-full" />
          </div>
        )}
        {patron && ownMember.error && (
          <ErrorState className="mb-0 mt-3" message={ownMember.error} onRetry={() => void ownMember.reload()} />
        )}
        {/* The department/course list only supplies names; without it the
            details above still show, with names marked "Unavailable". */}
        {patron && !ownMember.error && master.error && detailRows.length > 0 && (
          <p className="text-muted mt-3 flex flex-wrap items-center gap-2 text-xs" role="status">
            Department and course names didn’t load.
            <Button variant="ghost" onClick={() => void master.reload()}>
              Try again
            </Button>
          </p>
        )}
        {detailRows.length > 0 && (
          <p className="text-muted mt-3 text-xs">Ask the library desk to correct your ID or academic details.</p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Change display name">
          <form className="space-y-3" onSubmit={saveName}>
            {nameForm.error && <ErrorState message={nameForm.error} />}
            {nameForm.success && <Notice>Name updated.</Notice>}
            <FormField label="New name" required>
              <input
                id="display-name"
                className="field"
                autoComplete="name"
                placeholder={user?.name ?? "Full name"}
                value={nameForm.name}
                onChange={(e) => setNameForm((f) => ({ ...f, name: e.target.value, success: false }))}
              />
            </FormField>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" busy={nameForm.busy} busyLabel="Saving…">
                Save name
              </Button>
            </div>
          </form>
        </Card>

        <Card title="Change password">
          <form className="space-y-3" onSubmit={savePassword}>
            {pwForm.error && <ErrorState message={pwForm.error} />}
            {pwForm.success && <Notice>Password changed.</Notice>}
            <FormField label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`} required>
              <input
                id="new-password"
                className="field"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                value={pwForm.password}
                onChange={(e) => setPwForm((f) => ({ ...f, password: e.target.value, success: false }))}
              />
            </FormField>
            <FormField label="Confirm new password" required>
              <input
                id="confirm-password"
                className="field"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                value={pwForm.confirm}
                onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value, success: false }))}
              />
            </FormField>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" busy={pwForm.busy} busyLabel="Saving…">
                Change password
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
