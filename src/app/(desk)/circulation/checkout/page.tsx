"use client";

/*
 * Check out — lookalike of Koha's circ/circulation.tt:
 * scan/search bar at top, patron summary panel, checked-out items table.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import type { Book, Loan, Member } from "@/lib/types";
import { deriveLoanStatus } from "@/lib/loan-status";
import { formatDate } from "@/lib/utils";

export default function CheckoutPage() {
  const { data: booksData } = useApi<{ books: Book[] }>("/api/books");
  const { data: membersData } = useApi<{ members: Member[] }>("/api/members");
  const { data: loansData, reload } = useApi<{ loans: Loan[] }>("/api/loans");

  const [query, setQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [days, setDays] = useState(14);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const books = booksData?.books ?? [];
  const members = membersData?.members ?? [];
  const loans = loansData?.loans ?? [];

  const bookMatches = useMemo(() => {
    if (query.trim().length < 2) return [];
    const q = query.toLowerCase();
    return books
      .filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q) ||
          b.isbn.includes(q)
      )
      .slice(0, 6);
  }, [query, books]);

  const memberMatches = useMemo(() => {
    if (!selectedMember && query.trim().length >= 2) {
      const q = query.toLowerCase();
      return members
        .filter(
          (m) =>
            m.name.toLowerCase().includes(q) || m.studentId?.toLowerCase().includes(q)
        )
        .slice(0, 4);
    }
    return [];
  }, [query, members, selectedMember]);

  const memberLoans = loans.filter(
    (l) => selectedMember && l.memberId === selectedMember.id && l.status !== "returned"
  );
  const loanCap = 3;

  async function checkout(bookId: string) {
    if (!selectedMember) return;
    if (memberLoans.length >= loanCap) {
      setMessage({ tone: "err", text: `Patron already has the maximum of ${loanCap} active loans.` });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, memberId: selectedMember.id, days }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Checkout failed.");
      setMessage({
        tone: "ok",
        text: `Checked out "${body.title ?? "item"}" — due ${formatDate(body.dueAt) ?? "on time"}.`,
      });
      setQuery("");
      reload();
    } catch (error) {
      setMessage({ tone: "err", text: error instanceof Error ? error.message : "Checkout failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Check out</h1>
        <Link href="/circulation/checkin" className="btn-koha secondary">
          Switch to check in →
        </Link>
      </div>

      {/* Scan bar — Koha's checkout search field */}
      <form
        className="scan-bar"
        onSubmit={(e) => e.preventDefault()}
      >
        <label htmlFor="circ-query" style={{ fontWeight: 600 }}>
          Patron or title:
        </label>
        <input
          id="circ-query"
          className="scan-input"
          placeholder="Scan patron card / student ID, or type a title…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          autoFocus
        />
        <label htmlFor="days" style={{ fontSize: "0.85rem" }}>
          Days:
        </label>
        <select
          id="days"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          style={{ padding: "0.45rem", borderRadius: 6 }}
        >
          {[7, 14, 21, 30].map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        {selectedMember && (
          <button
            type="button"
            className="btn-koha secondary"
            onClick={() => {
              setSelectedMember(null);
              setQuery("");
            }}
          >
            Clear patron
          </button>
        )}
      </form>

      {message && (
        <p className={message.tone === "ok" ? "chip chip-ready" : "chip chip-overdue"} style={{ marginBottom: "1rem", display: "inline-block" }}>
          {message.text}
        </p>
      )}

      {/* Search results */}
      {!selectedMember && memberMatches.length > 0 && (
        <section className="koha-table-wrap" style={{ marginBottom: "1rem" }}>
          <table className="koha-table">
            <thead>
              <tr>
                <th>Patron matches</th>
                <th>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {memberMatches.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.name}</strong>{" "}
                    <span style={{ opacity: 0.7 }}>· {m.studentId ?? m.email}</span>
                  </td>
                  <td>{m.memberType}</td>
                  <td>
                    <button type="button" className="btn-koha" onClick={() => setSelectedMember(m)}>
                      Select
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Patron summary panel */}
      {selectedMember && (
        <>
          <section className="circ-card" style={{ marginBottom: "1rem" }}>
            <h3>
              {selectedMember.name} · {selectedMember.memberType} ·{" "}
              {memberLoans.length}/{loanCap} loans
            </h3>
          </section>

          {bookMatches.length > 0 && (
            <section className="koha-table-wrap" style={{ marginBottom: "1rem" }}>
              <table className="koha-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Author</th>
                    <th>Barcode/ISBN</th>
                    <th>Available</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {bookMatches.map((b) => (
                    <tr key={b.id}>
                      <td><strong>{b.title}</strong></td>
                      <td>{b.author}</td>
                      <td>{b.isbn}</td>
                      <td>{b.availableCopies} of {b.totalCopies}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-koha"
                          disabled={busy || b.availableCopies < 1}
                          onClick={() => checkout(b.id)}
                        >
                          Check out
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Patron's current checkouts — Koha issues table */}
          <section className="koha-table-wrap">
            <table className="koha-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Barcode</th>
                  <th>Due date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {memberLoans.length === 0 && (
                  <tr>
                    <td colSpan={4}>No checkouts.</td>
                  </tr>
                )}
                {memberLoans.map((l) => {
                  const status = deriveLoanStatus({ status: l.status, due_at: l.dueAt });
                  const book = books.find((b) => b.id === l.bookId);
                  return (
                    <tr key={l.id}>
                      <td>{book?.title ?? l.bookId}</td>
                      <td>{book?.isbn}</td>
                      <td>{formatDate(l.dueAt)}</td>
                      <td>
                        <span className={`chip chip-${status}`}>{status.replace("_", " ")}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
