"use client";

import { useEffect, useState } from "react";
import { useDeskSession } from "@/components/DeskSessionProvider";
import Link from "next/link";
import { buttonClass, Card, EmptyState, ErrorState, PageHeader, StatGrid, Table } from "@/components/ui";
import type { StudentCompletenessAudit, UserStatistics } from "@/lib/types";

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
  const [attempt, setAttempt] = useState(0);
  const loading = isAdmin && !error && (!stats || !audit);

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
    }).catch(() => {
      if (!cancelled) setError("Insights didn’t load. Try again in a moment.");
    });
    return () => { cancelled = true; };
  }, [isAdmin, filters, attempt]);

  function retry() {
    setError(null);
    setStats(null);
    setAudit(null);
    setAttempt((n) => n + 1);
  }

  if (session && !isAdmin) {
    return (
      <div>
        <PageHeader title="Insights" />
        <Card>
          <EmptyState title="Administrators only" body="Ask an admin if you need account statistics." />
        </Card>
      </div>
    );
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
      <PageHeader title="Insights" subtitle="Account statistics and how complete student records are." />
      {error && <ErrorState message={error} onRetry={retry} />}
      <StatGrid loading={loading} items={cards.map(([label, value]) => ({ label: String(label), value: value ?? "—" }))} />
      <Card title="Student data completeness">
        {loading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading completeness audit">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-5 w-2/3" />
            ))}
          </div>
        ) : audit ? (
          <>
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm sm:max-w-md">
              <dt className="text-muted">Student accounts</dt>
              <dd className="font-semibold">{audit.totalStudentAccounts}</dd>
              <dt className="text-muted">Student member records</dt>
              <dd className="font-semibold">{audit.totalStudentMembers}</dd>
              <dt className="text-muted">Linked accounts</dt>
              <dd className="font-semibold">{audit.linkedStudentAccounts}</dd>
              <dt className="text-muted">Unlinked records</dt>
              <dd className="font-semibold">{audit.unlinkedStudentRecords}</dd>
              <dt className="text-muted">Complete profiles</dt>
              <dd className="font-semibold">{audit.completeStudentProfiles}</dd>
              <dt className="text-muted">Incomplete profiles</dt>
              <dd className="font-semibold">{audit.incompleteStudentProfiles}</dd>
              <dt className="text-muted">Duplicate Student IDs</dt>
              <dd className="font-semibold">{audit.duplicateStudentIds.length}</dd>
            </dl>
            {audit.recordsRequiringReview.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 text-lg font-semibold">Records to review</h3>
                <Table caption="Student records to review" columns={["Name", "Missing fields", { label: "Action", hideLabel: true }]}>
                  {audit.recordsRequiringReview.slice(0, 50).map((r) => (
                    <tr key={r.memberId}>
                      <td>{r.name}</td>
                      <td>{r.missingFields.join(", ")}</td>
                      <td>
                        <Link className={buttonClass("ghost")} href={`/members?edit=${r.memberId}`}>
                          Correct
                        </Link>
                      </td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </>
        ) : null}
      </Card>
    </div>
  );
}
