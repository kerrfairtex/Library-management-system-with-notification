"use client";

/*
 * Home for students, faculty, teachers and community members. Every figure
 * comes from the caller's OWN record: /api/my-loans and /api/dashboard both
 * resolve the member from the session, never from the request.
 */
import Link from "next/link";
import { useMemo } from "react";
import { useApi } from "@/lib/hooks";
import type { Notification, PublicUser } from "@/lib/types";
import { formatDate, notificationTone } from "@/lib/utils";
import {
  currentlyBorrowed,
  dueLabel,
  finesOwed,
  holdCounts,
  loanLimitRemaining,
  peso,
  recentActivity,
  type MyFineRow,
  type MyHoldRow,
  type MyLoanRow,
} from "@/lib/dashboard-stats";
import { AcademicShelvesSection } from "@/components/AcademicShelves";
import { DueStamp, Greeting, KpiRow, Panel, QuickActions } from "./DashboardKit";

type MyRecord = {
  loans: MyLoanRow[];
  holds: MyHoldRow[];
  fines: MyFineRow[];
  loanLimit: number | null;
};

const muted = "text-muted";

export function PatronDashboard({
  user,
  notifications,
}: {
  user: PublicUser;
  notifications: Notification[];
}) {
  const record = useApi<MyRecord>("/api/my-loans");
  const now = useMemo(() => new Date(), []);

  const loans = record.data?.loans ?? [];
  const holds = record.data?.holds ?? [];
  const borrowed = currentlyBorrowed(loans, now);
  const overdueCount = borrowed.filter((b) => b.overdue).length;
  const owed = finesOwed(record.data?.fines ?? []);
  const remaining = loanLimitRemaining(record.data?.loanLimit, borrowed.length);
  const holdsNow = holdCounts(holds);
  const activity = recentActivity(loans, holds);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-5">
      <Greeting
        name={user.name}
        role={user.role}
        subtitle="Your loans, holds and fines at a glance."
      />

      <KpiRow
        loading={record.loading}
        items={[
          {
            label: "Borrowed",
            value: borrowed.length,
            hint: overdueCount ? `${overdueCount} overdue` : "None overdue",
            tone: overdueCount ? "danger" : undefined,
          },
          {
            label: "Can borrow",
            value: remaining,
            hint: `more book${remaining === 1 ? "" : "s"} right now`,
            tone: remaining === 0 ? "warn" : undefined,
          },
          {
            label: "Holds ready",
            value: holdsNow.ready,
            hint: `${holdsNow.waiting} still waiting`,
            tone: holdsNow.ready ? "ok" : undefined,
          },
          {
            label: "Fines owed",
            value: peso(owed),
            hint: owed > 0 ? "Pay at the circulation desk" : "You're all clear",
            tone: owed > 0 ? "warn" : undefined,
          },
        ]}
      />

      <section className="grid gap-5 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Books you have"
          href="/my-loans"
          linkLabel="My record"
          loading={record.loading}
          error={record.error}
          empty={
            borrowed.length === 0
              ? {
                  title: "No books checked out",
                  body: "Find something in the catalog and place a hold.",
                  action: <Link href="/books" className="btn btn-primary">Browse the catalog</Link>,
                }
              : null
          }
        >
          <ul className="space-y-2">
            {borrowed.map((b) => {
              const tone = b.overdue ? "danger" : b.daysLeft <= 3 ? "warn" : "ok";
              return (
                <li
                  key={b.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                    b.overdue ? "border-[var(--danger)] bg-[var(--danger-soft)]" : "border-[var(--line)]"
                  }`}
                >
                  <DueStamp dueAt={b.dueAt} tone={tone} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{b.title}</p>
                    {b.author && <p className={`truncate text-sm ${muted}`}>{b.author}</p>}
                  </div>
                  <span className={`badge tone-${tone === "ok" ? "info" : tone} shrink-0`}>
                    {dueLabel(b.daysLeft, b.overdue)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel
          title="Holds"
          href="/holds"
          linkLabel="All holds"
          loading={record.loading}
          error={record.error}
          empty={holds.length === 0 ? { title: "No holds", body: "Place a hold on a book that's out and we'll tell you when it's ready." } : null}
        >
          <ul className="space-y-2">
            {holds.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{h.books?.title ?? "Unknown title"}</p>
                  <p className={`text-xs ${muted}`}>Placed {formatDate(h.placed_at)}</p>
                </div>
                <span className={`badge ${h.status === "ready" ? "tone-ok" : "tone-info"} shrink-0`}>
                  {h.status === "ready" ? "Ready for pickup" : "Waiting"}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Panel
          title={unread ? `Alerts (${unread} new)` : "Alerts"}
          href="/notifications"
          linkLabel="All alerts"
          empty={notifications.length === 0 ? { title: "No alerts", body: "Due-date reminders and hold notices will appear here." } : null}
        >
          <ul className="space-y-2">
            {notifications.slice(0, 5).map((n) => (
              <li key={n.id} className={`rounded-xl border border-[var(--line)] px-3 py-2.5 ${n.read ? "opacity-70" : ""}`}>
                <div className="mb-1 flex items-center gap-2">
                  <span className={`badge ${notificationTone(n.type)}`}>{n.type.replace("_", " ")}</span>
                  <span className="text-xs text-muted">{formatDate(n.createdAt)}</span>
                </div>
                <p className="font-semibold">{n.title}</p>
                <p className={`text-sm ${muted}`}>{n.message}</p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Recent activity"
          loading={record.loading}
          error={record.error}
          empty={activity.length === 0 ? { title: "Nothing yet", body: "Your borrows, returns and holds will show up here." } : null}
        >
          <ol className="space-y-2">
            {activity.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] pb-2 last:border-0">
                <p className="min-w-0 text-sm">
                  <span className={muted}>{a.verb} </span>
                  <span className="font-semibold">{a.title}</span>
                </p>
                <time className={`shrink-0 text-xs ${muted}`} dateTime={a.at}>{formatDate(a.at)}</time>
              </li>
            ))}
          </ol>
        </Panel>
      </section>

      <section className="panel p-4 md:p-5">
        <form action="/catalog" method="get" role="search" className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="dash-q" className="sr-only">Search the catalog</label>
          <input id="dash-q" name="q" className="field" placeholder="Search by title, author or ISBN" />
          <button type="submit" className="btn btn-primary sm:w-auto">Search catalog</button>
        </form>
      </section>

      <AcademicShelvesSection />

      <QuickActions
        actions={[
          { href: "/books", label: "Browse the catalog", primary: true },
          { href: "/my-loans", label: "My record" },
          { href: "/holds", label: "My holds" },
          { href: "/fines", label: "My fines" },
        ]}
      />
    </div>
  );
}
