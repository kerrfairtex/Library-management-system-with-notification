"use client";

import { useEffect, useState } from "react";
import { useDeskSession } from "@/components/DeskSessionProvider";
import { ErrorState, PageHeader } from "@/components/ui";
import type { StudentCompletenessAudit, UserStatistics } from "@/lib/types";
import { StatGrid } from "@/components/dashboard/DashboardKit";

export const dynamic = "force-dynamic";

type Filters = { role: string; status: string; departmentId: string; courseId: string; yearLevel: string; section: string };

const emptyFilters: Filters = { role: "", status: "", departmentId: "", courseId: "", yearLevel: "", section: "" };

export default function AdminInsightsPage() {
  const { session } = useDeskSession();
  const isAdmin = session?.user?.role === "admin";
  const [stats, setStats] = useState<UserStatistics | null>(null);
  const [audit, setAudit] = useState<StudentCompletenessAudit | null>(null);
  const [filters] = useState<Filters>(emptyFilters);
  const [error, setError] = useState<string | null>(null);

  // Async state updates happen in .then callbacks, never synchronously in the
  // effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const query = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v).map(([k, v]) => [k, v])
    ).toString();
    Promise.all([
      fetch(`/api/admin/user-statistics${query ? `?${query}` : ""}`),
      fetch("/api/admin/student-completeness"),
    ]).then(async ([statsRes, auditRes]) => {
      if (!statsRes.ok || !auditRes.ok) throw new Error("Failed to load insights.");
      const [s, a] = await Promise.all([statsRes.json(), auditRes.json()]);
      if (!cancelled) {
        setStats(s as UserStatistics);
        setAudit(a as StudentCompletenessAudit);
      }
    }).catch((err: Error) => {
      if (!cancelled) setError(err.message);
    });
    return () => { cancelled = true; };
  }, [isAdmin, filters]);

  if (session && !isAdmin) {
    return <PageHeader title="Admin insights" subtitle="Administrators only." />;
  }

  const cards: Array<[string, number | undefined]> = [
    ["Total accounts", stats?.totalAccounts],
    ["Active", stats?.activeAccounts],
    ["Pending", stats?.pendingAccounts],
    ["Students", stats?.students],
    ["Faculty", stats?.faculty],
    ["Teachers", stats?.teachers],
    ["Community", stats?.community],
    ["Librarians", stats?.librarians],
    ["Admins", stats?.admins],
    ["Member profiles", stats?.totalMemberProfiles],
    ["Incomplete students", stats?.incompleteStudentProfiles],
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Admin insights" subtitle="Account statistics and student data completeness (database-backed)." />
      {error && <ErrorState message={error} />}
      <StatGrid items={cards.map(([label, value]) => ({ label: String(label), value: value ?? "—" }))} />
      <div className="panel p-4">
        <h2 className="display text-lg">Student data completeness audit</h2>
        {audit && (
          <ul className="mt-2 text-sm" style={{ lineHeight: 1.8 }}>
            <li>Student accounts: {audit.totalStudentAccounts}</li>
            <li>Student member records: {audit.totalStudentMembers}</li>
            <li>Linked accounts: {audit.linkedStudentAccounts}</li>
            <li>Unlinked records: {audit.unlinkedStudentRecords}</li>
            <li>Complete profiles: {audit.completeStudentProfiles}</li>
            <li>Incomplete profiles: {audit.incompleteStudentProfiles}</li>
            <li>Duplicate Student IDs: {audit.duplicateStudentIds.length}</li>
          </ul>
        )}
        {audit && audit.recordsRequiringReview.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr><th>Name</th><th>Missing fields</th><th>Action</th></tr></thead>
              <tbody>
                {audit.recordsRequiringReview.slice(0, 50).map((r) => (
                  <tr key={r.memberId}>
                    <td>{r.name}</td>
                    <td>{r.missingFields.join(", ")}</td>
                    <td><a className="btn btn-ghost" href={`/members?edit=${r.memberId}`}>Correct</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
