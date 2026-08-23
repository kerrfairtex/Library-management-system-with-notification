"use client";

/*
 * Check in — lookalike of Koha's circ/returns.tt:
 * scan barcode, confirm table (Title | Author | Barcode | Status | Due date),
 * with post-checkin notices (hold found / fine due).
 */

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import type { Book, Loan, Member } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type CheckinResult = {
  title: string;
  author: string;
  isbn: string;
  wasOverdue: boolean;
  returnedAt: string;
};

export default function CheckinPage() {
  const { data: booksData } = useApi<{ books: Book[] }>("/api/books");
  const { data: membersData } = useApi<{ members: Member[] }>("/api/members");
  const { data: loansData, reload } = useApi<{ loans: Loan[] }>("/api/loans");

  const [barcode, setBarcode] = useState("");
  const [results, setResults] = useState<CheckinResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const books = booksData?.books ?? [];
  const members = membersData?.members ?? [];
  const loans = loansData?.loans ?? [];

  async function checkin(e?: React.FormEvent) {
    e?.preventDefault();
    const q = barcode.trim();
    if (!q) return;
    setBusy(true);
    setMessage(null);
    try {
      // Match by ISBN/barcode or title fragment — same single-field flow as Koha.
      const book = books.find(
        (b) => b.isbn === q || b.title.toLowerCase().includes(q.toLowerCase())
      );
      if (!book) throw new Error(`No item matches "${q}".`);
      const loan = loans.find((l) => l.bookId === book.id && l.status !== "returned");
      if (!loan) throw new Error(`"${book.title}" is not currently checked out.`);

      const res = await fetch(`/api/loans/${loan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "return" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Check-in failed.");

      const member = members.find((m) => m.id === loan.memberId);
      setResults((prev) => [
        {
          title: book.title,
          author: book.author,
          isbn: book.isbn,
          wasOverdue: new Date(loan.dueAt).getTime() < Date.now(),
          returnedAt: body.returnedAt ?? new Date().toISOString(),
        },
        ...prev,
      ]);
      setMessage(`Checked in "${book.title}" from ${member?.name ?? "patron"}.`);
      setBarcode("");
      reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Check-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Check in</h1>
        <Link href="/circulation/checkout" className="btn-koha secondary">
          Switch to check out →
        </Link>
      </div>

      <form className="scan-bar" onSubmit={checkin}>
        <label htmlFor="checkin-barcode" style={{ fontWeight: 600 }}>
          Scan item:
        </label>
        <input
          id="checkin-barcode"
          className="scan-input"
          placeholder="Scan barcode / ISBN, or type a title…"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          autoComplete="off"
          autoFocus
        />
        <button type="submit" className="btn-koha" disabled={busy}>
          Check in
        </button>
      </form>

      {message && (
        <p style={{ marginBottom: "1rem", fontWeight: 500 }}>{message}</p>
      )}

      {/* Confirmation table — Koha returns.tt columns */}
      <section className="koha-table-wrap">
        <table className="koha-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>Barcode</th>
              <th>Status</th>
              <th>Returned</th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 && (
              <tr>
                <td colSpan={5}>Nothing checked in yet this session.</td>
              </tr>
            )}
            {results.map((r, i) => (
              <tr key={i}>
                <td><strong>{r.title}</strong></td>
                <td>{r.author}</td>
                <td>{r.isbn}</td>
                <td>
                  {r.wasOverdue ? (
                    <span className="chip chip-overdue">was overdue</span>
                  ) : (
                    <span className="chip chip-available">on time</span>
                  )}
                </td>
                <td>{formatDate(r.returnedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
