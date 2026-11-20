"use client";

/*
 * Admin-only additions to the desk dashboard. /api/admin/user-statistics
 * requires staff.manage on the server, so a librarian never receives these
 * figures even if this component were rendered for them.
 */
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import { roleLabel } from "@/lib/permissions";
import type { UserStatistics } from "@/lib/types";
import { roleCounts } from "@/lib/dashboard-stats";
import { Panel } from "./DashboardKit";

const muted = "text-muted";

export function AdminPanels() {
  const stats = useApi<UserStatistics>("/api/admin/user-statistics");
  const rows = stats.data ? roleCounts(stats.data) : [];

  return (
    <section className="grid gap-5 lg:grid-cols-3">
      <Panel
        className="lg:col-span-2"
        title="Accounts by role"
        href="/admin-insights"
        linkLabel="Insights"
        loading={stats.loading}
        error={stats.error}
        onRetry={stats.reload}
        empty={stats.data && stats.data.totalAccounts === 0 ? { title: "No accounts yet", body: "Create the first accounts in User accounts." } : null}
      >
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.role}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold">{roleLabel(r.role)}</span>
                <span className={muted}>
                  {r.count} <span className="text-xs">({r.share}%)</span>
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--sand)]" aria-hidden="true">
                <div className="h-full rounded-full bg-[var(--jade)]" style={{ width: `${r.share}%` }} />
              </div>
            </li>
          ))}
        </ul>
        {stats.data && (
          <p className={`mt-3 text-xs ${muted}`}>
            {stats.data.totalAccounts} accounts · {stats.data.pendingAccounts} pending approval ·{" "}
            {stats.data.incompleteStudentProfiles} student profiles incomplete
          </p>
        )}
      </Panel>

      <div className="space-y-5">
        <Panel title="Setup">
          <div className="grid gap-2">
            <Link href="/staff#academic-setup" className="btn btn-ghost justify-start">
              Departments &amp; courses
            </Link>
            <Link href="/settings" className="btn btn-ghost justify-start">
              System settings
            </Link>
            <Link href="/staff" className="btn btn-ghost justify-start">
              User accounts &amp; roles
            </Link>
          </div>
        </Panel>
      </div>
    </section>
  );
}
