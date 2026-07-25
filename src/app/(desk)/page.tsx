"use client";

import Link from "next/link";
import type { Book, DashboardStats, Member, Notification } from "@/lib/types";
import { canAccess, roleLabel } from "@/lib/permissions";
import type { EnrichedLoan } from "@/lib/utils";
import { useApi } from "@/lib/hooks";
import { daysUntil, formatDate, notificationTone } from "@/lib/utils";
import { ErrorBanner, PageHeader } from "@/components/ui";

type DashboardResponse = {
  user: { role: "student" | "librarian" | "admin"; name: string };
  roleTitle: string;
  stats: DashboardStats;
  recentLoans: EnrichedLoan[];
  notifications: Notification[];
  books: Book[];
  members: Member[];
};

export default function DashboardPage() {
  const { data, loading, error } = useApi<DashboardResponse>("/api/dashboard");

  if (loading) {
    return <p className="panel p-6 text-sm">Loading desk…</p>;
  }

  if (error || !data) {
    return <ErrorBanner message={error || "Failed to load dashboard."} />;
  }

  const { stats, recentLoans, notifications, user } = data;
  const isStudent = user.role === "student";
  const isAdmin = user.role === "admin";

  return (
    <div className="space-y-5">
      <PageHeader
        title={data.roleTitle}
        subtitle={
          isStudent
            ? "See the current library snapshot, available books, and your account access level."
            : isAdmin
              ? "Monitor operations, staffing access, books, members, and alerts across the full system."
              : "Run day-to-day circulation, manage books, and stay ahead of due-date alerts."
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(
          isStudent
            ? [
                { label: "Books in catalog", value: stats.totalBooks, hint: `${stats.availableBooks} available now` },
                { label: "Unread alerts", value: stats.unreadNotifications, hint: "Library updates and reminders" },
                { label: "Account role", value: roleLabel(user.role), hint: "Profile changes only" },
              ]
            : [
                { label: "Copies in stock", value: stats.totalBooks, hint: `${stats.availableBooks} available` },
                { label: "Active members", value: stats.totalMembers, hint: "Students & patrons" },
                { label: "Open loans", value: stats.activeLoans, hint: `${stats.overdueLoans} overdue` },
                { label: "Unread alerts", value: stats.unreadNotifications, hint: "Needs review" },
              ]
        ).map((item, i) => (
          <article
            key={item.label}
            className={`panel p-5 fade-up fade-up-delay-${Math.min(i, 3)}`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[color-mix(in_srgb,var(--ink)_45%,transparent)]">
              {item.label}
            </p>
            <p className="display mt-2 text-4xl">{item.value}</p>
            <p className="mt-1 text-sm text-[color-mix(in_srgb,var(--ink)_60%,transparent)]">{item.hint}</p>
          </article>
        ))}
      </section>

      {isStudent ? (
        <section className="grid gap-5 lg:grid-cols-2">
          <article className="panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="display text-2xl">Access summary</h2>
              <Link href="/profile" className="text-sm font-semibold text-[var(--jade)]">
                My profile
              </Link>
            </div>
            <div className="space-y-3 text-sm text-[color-mix(in_srgb,var(--ink)_70%,transparent)]">
              <p>You can view the catalog, alerts, and your own profile.</p>
              <p>Only librarians and admins can manage books, members, and circulation.</p>
            </div>
          </article>
          <article className="panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="display text-2xl">Alert feed</h2>
              <Link href="/notifications" className="text-sm font-semibold text-[var(--jade)]">
                All alerts
              </Link>
            </div>
            <div className="space-y-3">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`rounded-xl border border-[var(--line)] px-3 py-3 ${n.read ? "opacity-70" : ""}`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`badge ${notificationTone(n.type)}`}>
                      {n.type.replace("_", " ")}
                    </span>
                    <span className="text-xs text-[color-mix(in_srgb,var(--ink)_45%,transparent)]">
                      {formatDate(n.createdAt)}
                    </span>
                  </div>
                  <p className="font-semibold">{n.title}</p>
                  <p className="text-sm text-[color-mix(in_srgb,var(--ink)_65%,transparent)]">{n.message}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : (
      <section className="grid gap-5 lg:grid-cols-2">
        <article className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="display text-2xl">Recent circulation</h2>
            <Link href="/loans" className="text-sm font-semibold text-[var(--jade)]">
              Open loans
            </Link>
          </div>
          <div className="space-y-3">
            {recentLoans.map((loan) => {
              const due = daysUntil(loan.dueAt);
              return (
                <div
                  key={loan.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-[var(--line)] px-3 py-3"
                >
                  <div>
                    <p className="font-semibold">{loan.book?.title ?? "Unknown book"}</p>
                    <p className="text-sm text-[color-mix(in_srgb,var(--ink)_60%,transparent)]">
                      {loan.member?.name ?? "Unknown member"} · due {formatDate(loan.dueAt)}
                    </p>
                  </div>
                  <span
                    className={`badge ${
                      loan.status === "overdue"
                        ? "tone-danger"
                        : loan.status === "returned"
                          ? "tone-ok"
                          : due <= 3
                            ? "tone-warn"
                            : "tone-info"
                    }`}
                  >
                    {loan.status === "overdue"
                      ? `${Math.abs(due)}d overdue`
                      : loan.status === "returned"
                        ? "returned"
                        : due <= 0
                          ? "due today"
                          : `${due}d left`}
                  </span>
                </div>
              );
            })}
            {!recentLoans.length && (
              <p className="text-sm text-[color-mix(in_srgb,var(--ink)_55%,transparent)]">
                No loans yet.
              </p>
            )}
          </div>
        </article>

        <article className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="display text-2xl">Alert feed</h2>
            <Link href="/notifications" className="text-sm font-semibold text-[var(--jade)]">
              All alerts
            </Link>
          </div>
          <div className="space-y-3">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`rounded-xl border border-[var(--line)] px-3 py-3 ${n.read ? "opacity-70" : ""}`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className={`badge ${notificationTone(n.type)}`}>
                    {n.type.replace("_", " ")}
                  </span>
                  <span className="text-xs text-[color-mix(in_srgb,var(--ink)_45%,transparent)]">
                    {formatDate(n.createdAt)}
                  </span>
                </div>
                <p className="font-semibold">{n.title}</p>
                <p className="text-sm text-[color-mix(in_srgb,var(--ink)_65%,transparent)]">{n.message}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
      )}

      {isAdmin && (
        <section className="grid gap-5 lg:grid-cols-2">
          <article className="panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="display text-2xl">Administrative controls</h2>
              <Link href="/staff" className="text-sm font-semibold text-[var(--jade)]">
                Manage users
              </Link>
            </div>
            <div className="space-y-3 text-sm text-[color-mix(in_srgb,var(--ink)_70%,transparent)]">
              <p>Admins can create accounts, change roles, maintain members, and oversee all circulation activity.</p>
              <p>Use the Users area for access control and the Students area for membership records.</p>
            </div>
          </article>
          <article className="panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="display text-2xl">Operational quick links</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {canAccess(user, "staff.manage") && (
                <Link href="/staff" className="btn btn-primary">
                  User accounts
                </Link>
              )}
              <Link href="/members" className="btn btn-ghost">
                Students & members
              </Link>
              <Link href="/books" className="btn btn-ghost">
                Catalog
              </Link>
            </div>
          </article>
        </section>
      )}
    </div>
  );
}
