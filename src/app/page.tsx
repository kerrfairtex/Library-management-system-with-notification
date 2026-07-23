"use client";

import Link from "next/link";
import type { Book, DashboardStats, Member, Notification } from "@/lib/types";
import type { EnrichedLoan } from "@/lib/utils";
import { useApi } from "@/lib/hooks";
import { daysUntil, formatDate, notificationTone } from "@/lib/utils";
import { ErrorBanner, PageHeader } from "@/components/ui";

type DashboardResponse = {
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

  const { stats, recentLoans, notifications } = data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Circulation desk"
        subtitle="A live view of inventory, active loans, and the alerts that need attention."
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: "Copies in stock", value: stats.totalBooks, hint: `${stats.availableBooks} available` },
          { label: "Active members", value: stats.totalMembers, hint: "Registered patrons" },
          { label: "Open loans", value: stats.activeLoans, hint: `${stats.overdueLoans} overdue` },
          { label: "Unread alerts", value: stats.unreadNotifications, hint: "Needs review" },
        ].map((item, i) => (
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
    </div>
  );
}
