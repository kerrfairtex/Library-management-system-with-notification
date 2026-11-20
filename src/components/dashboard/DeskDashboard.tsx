"use client";

/*
 * Circulation desk home for librarians (admins get the same view plus their
 * own panels via `adminPanels`). Data comes from staff-only endpoints that
 * already enforce loans.manage / members.write on the server.
 */
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useApi } from "@/lib/hooks";
import type { Book, Fine, Member, Notification, PublicUser } from "@/lib/types";
import type { EnrichedLoan } from "@/lib/utils";
import { formatDate, notificationTone } from "@/lib/utils";
import { roleLabel } from "@/lib/permissions";
import {
  deskHoldQueues,
  deskToday,
  finesSummary,
  overdueLoans,
  pendingSignups,
  peso,
  type DeskHoldRow,
} from "@/lib/dashboard-stats";
import { Greeting, KpiRow, Panel, QuickActions } from "./DashboardKit";

const muted = "text-[color-mix(in_srgb,var(--ink)_60%,transparent)]";

export function DeskDashboard({
  user,
  notifications,
  books,
  members,
  adminPanels,
  extraActions = [],
}: {
  user: PublicUser;
  notifications: Notification[];
  books: Book[];
  members: Member[];
  adminPanels?: ReactNode;
  extraActions?: { href: string; label: string }[];
}) {
  const loans = useApi<{ data: EnrichedLoan[]; hasMore: boolean }>("/api/loans?pageSize=1000");
  const holds = useApi<{ holds: DeskHoldRow[] }>("/api/holds");
  const fines = useApi<{ fines: Fine[] }>("/api/fines");
  const accounts = useApi<PublicUser[]>("/api/users");
  const now = useMemo(() => new Date(), []);

  const bookTitle = useMemo(() => new Map(books.map((b) => [b.id, b.title])), [books]);
  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  const loanRows = loans.data?.data ?? [];
  const today = deskToday(loanRows, now);
  const overdue = overdueLoans(loanRows, now);
  const queues = deskHoldQueues(holds.data?.holds ?? []);
  const money = finesSummary(fines.data?.fines ?? [], now);
  const signups = pendingSignups(accounts.data ?? []);
  const kpiLoading = loans.loading || holds.loading || fines.loading;

  return (
    <div className="space-y-5">
      <Greeting
        name={user.name}
        role={user.role}
        subtitle={
          user.role === "admin"
            ? "Today's desk, plus accounts and system setup."
            : "Today's desk: what went out, what came back, and what needs you."
        }
      />

      <KpiRow
        loading={kpiLoading}
        items={[
          { label: "Checked out today", value: today.checkouts, hint: `${today.returns} returned today` },
          {
            label: "Overdue",
            value: overdue.length,
            hint: overdue.length ? "Loans past due" : "Nothing past due",
            tone: overdue.length ? "danger" : undefined,
          },
          {
            label: "Awaiting pickup",
            value: queues.pickups.length,
            hint: `${queues.waiting.length} holds waiting for a copy`,
            tone: queues.pickups.length ? "ok" : undefined,
          },
          {
            label: "Fines outstanding",
            value: peso(money.outstanding),
            hint: `${money.membersOwing} member${money.membersOwing === 1 ? "" : "s"} owe`,
            tone: money.outstanding > 0 ? "warn" : undefined,
          },
        ]}
      />

      <section className="grid gap-5 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Overdue"
          href="/loans"
          linkLabel="All loans"
          loading={loans.loading}
          error={loans.error}
          empty={overdue.length === 0 ? { title: "Nothing overdue", body: "Every open loan is within its due date." } : null}
        >
          <div className="table-wrap">
            <table className="data-table data-table-compact">
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Patron</th>
                  <th>Due</th>
                  <th>Late</th>
                </tr>
              </thead>
              <tbody>
                {overdue.slice(0, 8).map((l) => (
                  <tr key={l.id}>
                    <td className="max-w-[16rem] truncate font-semibold" title={l.book?.title}>{l.book?.title ?? "Unknown book"}</td>
                    <td className="max-w-[12rem] truncate">{l.member?.name ?? "Unknown patron"}</td>
                    <td className="whitespace-nowrap">{formatDate(l.dueAt)}</td>
                    <td>
                      <span className="badge tone-danger whitespace-nowrap">
                        {l.daysOverdue} day{l.daysOverdue === 1 ? "" : "s"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {overdue.length > 8 && (
            <p className={`mt-2 text-xs ${muted}`}>Showing the 8 most overdue of {overdue.length}.</p>
          )}
          {loans.data?.hasMore && (
            <p className={`mt-1 text-xs ${muted}`}>Counts cover the latest 1,000 loans.</p>
          )}
        </Panel>

        <Panel
          title="Holds"
          href="/holds"
          linkLabel="Holds queue"
          loading={holds.loading}
          error={holds.error}
          empty={
            queues.pickups.length + queues.waiting.length === 0
              ? { title: "No open holds", body: "Nothing to shelve for pickup." }
              : null
          }
        >
          {queues.pickups.length > 0 && (
            <>
              <p className="label">Ready for pickup</p>
              <ul className="mb-3 space-y-2">
                {queues.pickups.slice(0, 4).map((h) => (
                  <li key={h.id} className="rounded-xl border border-[var(--line)] px-3 py-2">
                    <p className="truncate font-semibold">{bookTitle.get(h.book_id) ?? "Unknown book"}</p>
                    <p className={`text-xs ${muted}`}>
                      {memberName.get(h.member_id) ?? "Unknown patron"}
                      {h.expires_at ? ` · pick up by ${formatDate(h.expires_at)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
          {queues.waiting.length > 0 && (
            <>
              <p className="label">Waiting for a copy</p>
              <ul className="space-y-2">
                {queues.waiting.slice(0, 4).map((h) => (
                  <li key={h.id} className="rounded-xl border border-[var(--line)] px-3 py-2">
                    <p className="truncate font-semibold">{bookTitle.get(h.book_id) ?? "Unknown book"}</p>
                    <p className={`text-xs ${muted}`}>
                      {memberName.get(h.member_id) ?? "Unknown patron"} · since {formatDate(h.placed_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
          {queues.borrowRequests > 0 && (
            <Link href="/holds" className="btn btn-ghost mt-3 w-full">
              Review {queues.borrowRequests} borrow request{queues.borrowRequests === 1 ? "" : "s"}
            </Link>
          )}
        </Panel>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <Panel
          title="Sign-ups to approve"
          href="/staff"
          linkLabel="User accounts"
          loading={accounts.loading}
          error={accounts.error}
          empty={signups.length === 0 ? { title: "No pending sign-ups", body: "New Google sign-ups waiting for approval appear here." } : null}
        >
          <ul className="space-y-2">
            {signups.slice(0, 5).map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{u.name}</p>
                  <p className={`truncate text-xs ${muted}`}>{u.email}</p>
                </div>
                <span className="badge tone-warn shrink-0">{roleLabel(u.role)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Fines" href="/fines" linkLabel="Fines desk" loading={fines.loading} error={fines.error}>
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className={`text-xs ${muted}`}>Outstanding</dt>
              <dd className="display text-2xl">{peso(money.outstanding)}</dd>
            </div>
            <div>
              <dt className={`text-xs ${muted}`}>Collected today</dt>
              <dd className="display text-2xl">{peso(money.paidToday)}</dd>
            </div>
            <div className="col-span-2">
              <dt className={`text-xs ${muted}`}>Members with unpaid fines</dt>
              <dd className="font-semibold">{money.membersOwing}</dd>
            </div>
          </dl>
        </Panel>

        <Panel
          title="Alerts"
          href="/notifications"
          linkLabel="All alerts"
          empty={notifications.length === 0 ? { title: "No alerts", body: "Low stock and overdue notices will appear here." } : null}
        >
          <ul className="space-y-2">
            {notifications.slice(0, 4).map((n) => (
              <li key={n.id} className={`rounded-xl border border-[var(--line)] px-3 py-2 ${n.read ? "opacity-70" : ""}`}>
                <span className={`badge ${notificationTone(n.type)}`}>{n.type.replace("_", " ")}</span>
                <p className="mt-1 text-sm font-semibold">{n.title}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      {adminPanels}

      <QuickActions
        actions={[
          { href: "/circulation/checkout", label: "Check out", primary: true },
          { href: "/circulation/checkin", label: "Return" },
          { href: "/staff", label: "Add patron" },
          ...extraActions,
        ]}
      />
    </div>
  );
}
