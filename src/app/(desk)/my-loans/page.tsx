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

// Force dynamic rendering - this page needs session and database access
export const dynamic = "force-dynamic";

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

type MyBorrowRequest = {
  id: string;
  book_id: string;
  kind: string;
  status: string;
  priority: number;
  placed_at: string;
  expires_at: string | null;
  books: { title: string } | null;
};

function peso(n: string | number) {
  return `₱${Number(n).toFixed(2)}`;
}

export default function MyLoansPage() {
  const { data, loading, error } = useApi<{
    loans: MyLoan[];
    holds: MyHold[];
    borrowRequests: MyBorrowRequest[];
    fines: MyFine[];
  }>("/api/my-loans");

  const loans = data?.loans ?? [];
  const holds = data?.holds ?? [];
  const borrowRequests = data?.borrowRequests ?? [];
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
        <section className="circ-card">
          <h3>Borrow requests</h3>
          <p style={{ fontSize: "1.6rem", fontWeight: 700 }}>{borrowRequests.length}</p>
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

      {/* Borrow Requests */}
      <section className="koha-table-wrap" style={{ marginBottom: "1.25rem" }}>
        <table className="koha-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Requested on</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {borrowRequests.length === 0 && (
              <tr><td colSpan={4}>No borrow requests yet.</td></tr>
            )}
            {borrowRequests.map((r: MyBorrowRequest) => (
              <tr key={r.id}>
                <td><strong>{r.books?.title ?? "Unknown title"}</strong></td>
                <td>{formatDate(r.placed_at)}</td>
                <td>
                  <span className={`chip chip-${
                    r.status === "pending" ? "overdue"
                    : r.status === "ready" ? "available"
                    : r.status === "fulfilled" ? "available"
                    : r.status === "rejected" ? "overdue"
                    : "tone-info"
                  }`}>
                    {r.status}
                  </span>
                </td>
                <td>
                  {r.status === "pending" && (
                    <button
                      type="button"
                      className="btn-koha secondary"
                      style={{ fontSize: "0.8rem", padding: "0.2rem 0.5rem" }}
                      onClick={async () => {
                        try {
                          await fetch("/api/borrow-requests", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: r.id, action: "cancel" }),
                          });
                          window.location.reload();
                        } catch (e) {
                          window.alert("Failed to cancel request.");
                        }
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </td>
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
