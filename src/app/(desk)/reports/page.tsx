"use client";

/*
 * Reports home — lookalike of Koha's reports/reports-home.tt:
 * stat-report cards mapped to fixed dashboards over the trac_library schema.
 */

import Link from "next/link";
import { useApi } from "@/lib/hooks";
import type { Book, Loan, Member } from "@/lib/types";

export default function ReportsPage() {
  const { data: booksData } = useApi<{ books: Book[] }>("/api/books");
  const { data: membersData } = useApi<{ members: Member[] }>("/api/members");
  const { data: loansData } = useApi<{ loans: Loan[] }>("/api/loans");

  const books = booksData?.books ?? [];
  const loans = loansData?.loans ?? [];
  const members = membersData?.members ?? [];

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
  const overdue = openLoans.filter(
    (l) => l.status === "overdue" || new Date(l.dueAt).getTime() < Date.now()
  );

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Reports</h1>
      </div>

      <div className="circ-grid" style={{ marginBottom: "1.25rem" }}>
        <section className="circ-card">
          <h3>Catalogue stats</h3>
          <p><strong>{books.length}</strong> titles · <strong>{totalCopies}</strong> copies · <strong>{availableCopies}</strong> on shelf</p>
        </section>
        <section className="circ-card">
          <h3>Issues stats</h3>
          <p><strong>{openLoans.length}</strong> out · <strong>{loans.length}</strong> all-time · <strong style={{ color: "#8c1d1d" }}>{overdue.length}</strong> overdue</p>
        </section>
        <section className="circ-card">
          <h3>Patron stats</h3>
          <p><strong>{members.length}</strong> patrons · <strong>{members.filter((m) => m.active).length}</strong> active</p>
        </section>
      </div>

      <div className="circ-grid">
        <section className="koha-table-wrap">
          <table className="koha-table">
            <thead>
              <tr>
                <th colSpan={2}>Top circulated titles</th>
              </tr>
            </thead>
            <tbody>
              {topTitles.length === 0 && (
                <tr><td colSpan={2}>No circulation yet.</td></tr>
              )}
              {topTitles.map(({ book, count }) => (
                <tr key={book.id}>
                  <td>{book.title}</td>
                  <td style={{ fontWeight: 700 }}>{count}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="koha-table-wrap">
          <table className="koha-table">
            <thead>
              <tr>
                <th colSpan={2}>Top borrowers</th>
              </tr>
            </thead>
            <tbody>
              {topPatrons.length === 0 && (
                <tr><td colSpan={2}>No circulation yet.</td></tr>
              )}
              {topPatrons.map(({ member, count }) => (
                <tr key={member.id}>
                  <td>{member.name}</td>
                  <td style={{ fontWeight: 700 }}>{count}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <p style={{ marginTop: "1rem", fontSize: "0.85rem", opacity: 0.7 }}>
        Report layouts ported from Koha guided reports (cat_issues_top, bor_issues_top,
        catalogue_stats, issues_stats). <Link href="/circulation">Back to circulation →</Link>
      </p>
    </div>
  );
}
