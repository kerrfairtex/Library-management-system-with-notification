"use client";

/*
 * My Library Record — self-service page for students/members:
 * current loans with due dates, open holds, and outstanding fines.
 * Also the landing target after placing a hold from the 3D bookshelf.
 */

import { useApi } from "@/lib/hooks";
import { formatDate } from "@/lib/utils";
import { deriveLoanStatus } from "@/lib/loan-status";
import Link from "next/link";

type MyLoan = {
  id: string;
  book_id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  status: string;
  books: { title: string; author: string; isbn: string } | null;
};
type MyHold = {
  id: string;
  book_id: string;
  status: string;
  priority: number;
  placed_at: string;
  books: { title: string } | null;
};
type MyFine = {
  id: string;
  amount: string | number;
  amount_outstanding: string | number;
  description: string | null;
  created_at: string;
};

function peso(n: string | number) {
  return `₱${Number(n).toFixed(2)}`;
}

export default function MyLoansPage() {
  const { data, loading, error } = useApi<{
    loans: MyLoan[];
    holds: MyHold[];
    fines: MyFine[];
  }>("/api/my-loans");

  const loans = data?.loans ?? [];
  const holds = data?.holds ?? [];
  const fines = data?.fines ?? [];
  const open = loans.filter((l) => !l.returned_at);
  const totalOwed = fines.reduce((s, f) => s + Number(f.amount_outstanding), 0);

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">My library record</h1>
        <Link href="/books" className="btn-koha secondary">
          Search catalog →
        </Link>
      </div>

      {/* Summary cards */}
      <div className="circ-grid" style={{ marginBottom: "1.25rem" }}>
        <section className="circ-card">
          <h3>Books out</h3>
          <p style={{ fontSize: "1.6rem", fontWeight: 700 }}>{open.length}</p>
        </section>
        <section className="circ-card">
          <h3>Holds waiting</h3>
          <p style={{ fontSize: "1.6rem", fontWeight: 700 }}>{holds.length}</p>
        </section>
        <section className="circ-card">
          <h3>Fines owed</h3>
          <p
            style={{
              fontSize: "1.6rem",
              fontWeight: 700,
              color: totalOwed > 0 ? "#8c1d1d" : undefined,
            }}
          >
            {peso(totalOwed)}
          </p>
        </section>
      </div>

      {error && <p className="chip chip-overdue">{error}</p>}
      {loading && <p>Loading your record…</p>}

      {/* Checkouts */}
      <section className="koha-table-wrap" style={{ marginBottom: "1.25rem" }}>
        <table className="koha-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Borrowed</th>
              <th>Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loans.length === 0 && (
              <tr><td colSpan={4}>No checkouts yet. Browse the catalog to borrow.</td></tr>
            )}
            {loans.map((l) => {
              const status = l.returned_at
                ? "returned"
                : deriveLoanStatus({ status: l.status as never, due_at: l.due_at });
              return (
                <tr key={l.id}>
                  <td>
                    <strong>{l.books?.title ?? "Unknown title"}</strong>
                    <br />
                    <span style={{ opacity: 0.7 }}>{l.books?.author}</span>
                  </td>
                  <td>{formatDate(l.borrowed_at)}</td>
                  <td>{formatDate(l.due_at)}</td>
                  <td>
                    <span className={`chip chip-${status}`}>
                      {l.returned_at ? "returned" : status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Holds */}
      <section className="koha-table-wrap" style={{ marginBottom: "1.25rem" }}>
        <table className="koha-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Placed on</th>
              <th>Queue position</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {holds.length === 0 && (
              <tr><td colSpan={4}>No open holds.</td></tr>
            )}
            {holds.map((h) => (
              <tr key={h.id}>
                <td><strong>{h.books?.title ?? "Unknown title"}</strong></td>
                <td>{formatDate(h.placed_at)}</td>
                <td>#{h.priority}</td>
                <td><span className={`chip chip-${h.status}`}>{h.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Fines */}
      <section className="koha-table-wrap">
        <table className="koha-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {fines.length === 0 && (
              <tr><td colSpan={4}>No outstanding fines — keep it up!</td></tr>
            )}
            {fines.map((f) => (
              <tr key={f.id}>
                <td>{f.description ?? f.id}</td>
                <td>{formatDate(f.created_at)}</td>
                <td>{peso(f.amount)}</td>
                <td style={{ fontWeight: 700 }}>{peso(f.amount_outstanding)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {fines.length > 0 && (
          <p style={{ padding: "0.6rem 0.75rem", fontSize: "0.85rem", opacity: 0.8 }}>
            Settle fines at the library desk. Contact 0963 713 0812 for questions.
          </p>
        )}
      </section>
    </div>
  );
}
