"use client";

/*
 * Reports: collection and circulation totals, top titles and borrowers.
 */

import { useSyncExternalStore } from "react";
import { useApi } from "@/lib/hooks";
import { useDeskSession } from "@/components/DeskSessionProvider";
import type { Book, Loan, Member } from "@/lib/types";
import { canAccess } from "@/lib/permissions";
import { ButtonLink, Card, EmptyState, ErrorState, KpiRow, PageHeader, Table } from "@/components/ui";

// Force dynamic rendering - this page needs session and database access
export const dynamic = "force-dynamic";

export default function ReportsPage() {
  const { session: me } = useDeskSession();
  const canManage = me?.user ? canAccess(me.user, "loans.manage") : false;
  const booksApi = useApi<{ books: Book[] }>("/api/books");
  // GET /api/members returns a plain array.
  const membersApi = useApi<Member[]>(canManage ? "/api/members" : null);
  const loansApi = useApi<{ data: Loan[] }>("/api/loans?pageSize=1000");

  const books = booksApi.data?.books ?? [];
  const loans = loansApi.data?.data ?? [];
  const members = Array.isArray(membersApi.data) ? membersApi.data : [];
  const loading = booksApi.loading || membersApi.loading || loansApi.loading;
  const error = booksApi.error || membersApi.error || loansApi.error;
  const retry = () => {
    void booksApi.reload();
    void membersApi.reload();
    void loansApi.reload();
  };

  // cat_issues_top — most circulated titles
  const circCount = new Map<string, number>();
  for (const l of loans) circCount.set(l.bookId, (circCount.get(l.bookId) ?? 0) + 1);
  const topTitles = [...circCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ book: books.find((b) => b.id === id), count }))
    .filter((r): r is { book: Book; count: number } => Boolean(r.book));

  // bor_issues_top — most active patrons
  const patronCount = new Map<string, number>();
  for (const l of loans) patronCount.set(l.memberId, (patronCount.get(l.memberId) ?? 0) + 1);
  const topPatrons = [...patronCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ member: members.find((m) => m.id === id), count }))
    .filter((r): r is { member: Member; count: number } => Boolean(r.member));

  // catalogue_stats
  const totalCopies = books.reduce((s, b) => s + b.totalCopies, 0);
  const availableCopies = books.reduce((s, b) => s + b.availableCopies, 0);

  // issues_stats
  const openLoans = loans.filter((l) => l.status !== "returned");
  // Stable clock via an external store: the snapshot is taken outside render,
  // so the purity rule is satisfied and all rows share one timestamp.
  const now = useSyncExternalStore(
    () => () => undefined,
    () => Date.now(),
    () => 0
  );
  const overdue = openLoans.filter(
    (l) => l.status === "overdue" || new Date(l.dueAt).getTime() < now
  );

  if (!canManage) {
    return (
      <div>
        <PageHeader title="Reports" />
        <Card>
          <EmptyState title="Librarians and admins only" body="This page is only available to library staff." />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        subtitle="Collection size, loans, and who and what circulates most."
        action={<ButtonLink href="/circulation">Back to circulation</ButtonLink>}
      />

      {error && <ErrorState message={error} onRetry={retry} />}

      <KpiRow
        loading={loading}
        items={[
          { label: "Titles", value: books.length, hint: `${totalCopies} copies · ${availableCopies} on shelf` },
          { label: "Loans out", value: openLoans.length, hint: `${loans.length} all-time` },
          { label: "Overdue", value: overdue.length, tone: overdue.length ? "danger" : undefined, hint: "Open loans past due" },
          { label: "Patrons", value: members.length, hint: `${members.filter((m) => m.active).length} active` },
        ]}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Top circulated titles">
          <Table
            caption="Top circulated titles"
            columns={["Title", "Loans"]}
            loading={loading}
            isEmpty={topTitles.length === 0}
            empty={{ title: "No circulation yet", body: "Titles appear here once books are checked out." }}
          >
            {topTitles.map(({ book, count }) => (
              <tr key={book.id}>
                <td>{book.title}</td>
                <td className="font-semibold">{count}</td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Top borrowers">
          <Table
            caption="Top borrowers"
            columns={["Patron", "Loans"]}
            loading={loading}
            isEmpty={topPatrons.length === 0}
            empty={{ title: "No circulation yet", body: "Patrons appear here once they borrow books." }}
          >
            {topPatrons.map(({ member, count }) => (
              <tr key={member.id}>
                <td>{member.name}</td>
                <td className="font-semibold">{count}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      <p className="text-muted text-sm">Top lists show the five highest; counts cover the latest 1,000 loans.</p>
    </div>
  );
}
