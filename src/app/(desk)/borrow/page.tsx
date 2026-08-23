"use client";

/*
 * /borrow — landing target for the 3D bookshelf's "Borrow this book" CTA.
 * Reads ?isbn=<isbn>, shows the book's live availability, and lets an
 * authenticated member of staff (loans.manage) check it out to a patron.
 *
 * Flow: scan/select patron → choose loan days → confirm → POST /api/loans.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useApi } from "@/lib/hooks";
import type { Book, Loan, Member, PublicUser } from "@/lib/types";
import { canAccess, type AppCapability } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";

function BorrowInner() {
  const searchParams = useSearchParams();
  const isbn = searchParams.get("isbn") ?? "";

  const { data: booksData, loading: booksLoading } = useApi<{ books: Book[] }>("/api/books");
  const { data: membersData } = useApi<{ members: Member[] }>("/api/members");
  const { data: loansData, reload } = useApi<{ loans: Loan[] }>("/api/loans");
  const { data: session } = useApi<{ user: PublicUser }>("/api/auth/me");

  const [memberId, setMemberId] = useState("");
  const [days, setDays] = useState(14);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const books = booksData?.books ?? [];
  const members = membersData?.members ?? [];
  const loans = loansData?.loans ?? [];
  const user = session?.user;
  const canManage = canAccess(user, "loans.manage" as AppCapability);

  // Support both exact ISBN and a fuzzy fallback (title paste from the shelf).
  const book = useMemo(() => {
    if (!isbn) return null;
    const q = isbn.trim().toLowerCase();
    return (
      books.find((b) => b.isbn.toLowerCase() === q) ??
      books.find(
        (b) =>
          b.isbn.toLowerCase().includes(q) || b.title.toLowerCase().includes(q)
      ) ??
      null
    );
  }, [isbn, books]);

  const activeLoans = book
    ? loans.filter((l) => l.bookId === book.id && l.status !== "returned")
    : [];
  const memberLoans = loans.filter(
    (l) => l.memberId === memberId && l.status !== "returned"
  );

  useEffect(() => {
    setMessage(null);
  }, [book?.id]);

  async function borrow(e: React.FormEvent) {
    e.preventDefault();
    if (!book || !memberId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: book.id, memberId, days }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Borrow failed.");
      setMessage({
        tone: "ok",
        text: `"${book.title}" checked out — due ${formatDate(body.dueAt) ?? "on time"}.`,
      });
      reload();
    } catch (error) {
      setMessage({
        tone: "err",
        text: error instanceof Error ? error.message : "Borrow failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!isbn) {
    return (
      <div>
        <div className="page-head">
          <h1 className="page-title">Borrow</h1>
        </div>
        <section className="circ-card">
          <p>No book specified. Open this page from the 3D bookshelf, or</p>
          <Link href="/books" className="btn-koha secondary" style={{ marginTop: "0.6rem", display: "inline-flex" }}>
            Search the catalog →
          </Link>
        </section>
      </div>
    );
  }

  if (booksLoading) {
    return <p style={{ padding: "2rem 0" }}>Loading book…</p>;
  }

  if (!book) {
    return (
      <div>
        <div className="page-head">
          <h1 className="page-title">Borrow</h1>
        </div>
        <section className="circ-card">
          <p>
            No book in the catalog matches{" "}
            <strong>{isbn}</strong>.
          </p>
          <Link href="/books/new" className="btn-koha" style={{ marginTop: "0.6rem", display: "inline-flex" }}>
            Fast cataloging — add it
          </Link>
        </section>
      </div>
    );
  }

  const available = book.availableCopies > 0;

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Borrow</h1>
        <Link href="/circulation/checkout" className="btn-koha secondary">
          Full check-out desk →
        </Link>
      </div>

      {/* Book details panel */}
      <section className="circ-card" style={{ marginBottom: "1.1rem" }}>
        <h3>{book.title}</h3>
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "0.35rem 1rem",
            fontSize: "0.92rem",
            margin: 0,
          }}
        >
          <dt>Author</dt>
          <dd style={{ margin: 0 }}>{book.author}</dd>
          <dt>ISBN</dt>
          <dd style={{ margin: 0 }}>{book.isbn}</dd>
          <dt>Genre</dt>
          <dd style={{ margin: 0 }}>{book.genre}</dd>
          <dt>Copies</dt>
          <dd style={{ margin: 0 }}>
            <span className={`chip chip-${available ? "available" : "on_loan"}`}>
              {book.availableCopies} of {book.totalCopies} available
            </span>
          </dd>
          <dt>Currently out</dt>
          <dd style={{ margin: 0 }}>{activeLoans.length} active loan(s)</dd>
        </dl>
      </section>

      {!canManage ? (
        <StudentHoldPanel bookId={book.id} available={available} />
      ) : !available ? (
        <section className="circ-card">
          <p>All copies are currently checked out.</p>
          <p style={{ opacity: 0.75 }}>Place a hold from the circulation desk once a copy is returned.</p>
        </section>
      ) : (
        /* Borrow form */
        <form onSubmit={borrow}>
          <div className="scan-bar">
            <label htmlFor="borrow-member" style={{ fontWeight: 600 }}>
              Patron:
            </label>
            <select
              id="borrow-member"
              className="scan-input"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              required
            >
              <option value="">Select patron…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.studentId ? ` · ${m.studentId}` : ""}
                </option>
              ))}
            </select>
            <label htmlFor="borrow-days" style={{ fontSize: "0.85rem" }}>
              Days:
            </label>
            <select
              id="borrow-days"
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
            <button type="submit" className="btn-koha" disabled={busy || !memberId}>
              Confirm borrow
            </button>
          </div>

          {memberId && (
            <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>
              {memberLoans.length}/3 active loans for this patron.
            </p>
          )}
        </form>
      )}

      {message && (
        <p
          className={`chip chip-${message.tone === "ok" ? "ready" : "overdue"}`}
          style={{ marginTop: "1rem", display: "inline-block" }}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

export default function BorrowPage() {
  return (
    <Suspense fallback={<p style={{ padding: "2rem 0" }}>Loading…</p>}>
      <BorrowInner />
    </Suspense>
  );
}


function StudentHoldPanel({ bookId, available }: { bookId: string; available: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function placeHold() {
    setState("busy");
    try {
      const res = await fetch("/api/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not place hold.");
      setState("done");
      setMessage(
        `Hold placed! You are #${body.hold.priority} in the queue — we'll notify you when it's ready.`
      );
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Could not place hold.");
    }
  }

  if (state === "done") {
    return (
      <section className="circ-card">
        <p>✅ {message}</p>
        <Link href="/my-loans" className="btn-koha" style={{ marginTop: "0.6rem", display: "inline-flex" }}>
          View my record →
        </Link>
      </section>
    );
  }

  return (
    <section className="circ-card">
      <p>
        {available
          ? "A copy is on the shelf! Bring this page to the library desk to borrow it now."
          : "All copies are out — place a hold and we'll keep your spot in the queue."}
      </p>
      <button type="button" className="btn-koha" onClick={placeHold} disabled={state === "busy"}>
        {state === "busy" ? "Placing…" : "Place a hold"}
      </button>
      {state === "error" && (
        <p className="chip chip-overdue" style={{ marginLeft: "0.6rem" }}>{message}</p>
      )}
    </section>
  );
}
