"use client";

/*
 * /borrow — landing target for the 3D bookshelf's "Borrow this book" CTA.
 * Reads ?isbn=<isbn>, shows the book's live availability, and lets an
 * authenticated member of staff (loans.manage) check it out to a patron.
 *
 * Flow: scan/select patron → choose loan days → confirm → POST /api/loans.
 */

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { csrfHeaders, useApi } from "@/lib/hooks";
import { useDeskSession } from "@/components/DeskSessionProvider";
import type { Book, Loan, Member } from "@/lib/types";
import { canAccess, type AppCapability } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorState, FormField, Notice, PageHeader } from "@/components/ui";

// Force dynamic rendering - this page needs session and database access
// DEPLOY TRIGGER: 2026-10-03T15:30:00
export const dynamic = "force-dynamic";

function BorrowInner() {
  const searchParams = useSearchParams();
  const isbn = searchParams.get("isbn") ?? "";

  const { session } = useDeskSession();
  const canManage = canAccess(session?.user, "loans.manage" as AppCapability);
  const { data: booksData, loading: booksLoading, error: booksError, reload: reloadBooks } = useApi<{ books: Book[] }>("/api/books");
  // GET /api/members returns a plain array (staff only); GET /api/loans returns { data }.
  const { data: membersData } = useApi<Member[]>(canManage ? "/api/members" : null);
  const { data: loansData, reload } = useApi<{ data: Loan[] }>(canManage ? "/api/loans?pageSize=1000" : null);
  const { data: settingsData } = useApi<{ max_active_loans_per_member: number }>(canManage ? "/api/settings/circulation" : null);

  const [memberId, setMemberId] = useState("");
  const [days, setDays] = useState(14);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string; bookId: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const books = booksData?.books ?? [];
  const members = Array.isArray(membersData) ? membersData : [];
  const loans = loansData?.data ?? [];
  const loanCap = settingsData?.max_active_loans_per_member ?? 3;

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

  async function borrow(e: React.FormEvent) {
    e.preventDefault();
    if (!book || !memberId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ bookId: book.id, memberId, days }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Borrow failed.");
      setMessage({
        bookId: book.id,
        tone: "ok",
        text: `"${book.title}" checked out. Due ${formatDate(body.dueAt)}.`,
      });
      reload();
    } catch (error) {
      setMessage({
        bookId: book.id,
        tone: "danger",
        text: error instanceof Error ? error.message : "Borrow failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!isbn) {
    return (
      <div>
        <PageHeader title="Borrow a book" />
        <Card>
          <EmptyState
            title="No book chosen"
            body="Open this page from a book in the catalog or the 3D bookshelf."
            action={<ButtonLink href="/books" variant="primary">Search the catalog</ButtonLink>}
          />
        </Card>
      </div>
    );
  }

  if (booksLoading) {
    return (
      <div aria-busy="true" aria-label="Loading book">
        <div className="skeleton mb-5 h-9 w-56" />
        <div className="panel space-y-2 p-5">
          <div className="skeleton h-6 w-2/3" />
          <div className="skeleton h-4 w-1/2" />
          <div className="skeleton h-4 w-1/3" />
        </div>
      </div>
    );
  }

  if (booksError) {
    return (
      <div>
        <PageHeader title="Borrow a book" />
        <ErrorState message={booksError} onRetry={reloadBooks} />
      </div>
    );
  }

  if (!book) {
    return (
      <div>
        <PageHeader title="Borrow a book" />
        <Card>
          <EmptyState
            title="Not in the catalog"
            body={<>No book in the catalog matches <strong>{isbn}</strong>.</>}
            action={
              canManage ? (
                <Link href="/books?add=1" className="btn btn-primary">
                  Fast cataloging: add it
                </Link>
              ) : (
                <ButtonLink href="/books">Search the catalog</ButtonLink>
              )
            }
          />
        </Card>
      </div>
    );
  }

  const available = book.availableCopies > 0;

  return (
    <div>
      <PageHeader
        title="Borrow a book"
        action={canManage ? <ButtonLink href="/circulation/checkout">Full check-out desk</ButtonLink> : undefined}
      />

      <Card title={book.title} className="mb-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted">Author</dt>
          <dd>{book.author}</dd>
          <dt className="text-muted">ISBN</dt>
          <dd>{book.isbn}</dd>
          <dt className="text-muted">Genre</dt>
          <dd>{book.genre}</dd>
          <dt className="text-muted">Copies</dt>
          <dd>
            <Badge tone={available ? "ok" : "info"}>
              {book.availableCopies} of {book.totalCopies} available
            </Badge>
          </dd>
          {canManage && (
            <>
              <dt className="text-muted">Currently out</dt>
              <dd>
                {activeLoans.length} active loan{activeLoans.length === 1 ? "" : "s"}
              </dd>
            </>
          )}
        </dl>
      </Card>

      {!canManage ? (
        <StudentBorrowPanel bookId={book.id} available={available} />
      ) : !available ? (
        <Card>
          <EmptyState title="All copies are checked out" body="Place a hold from the circulation desk once a copy is returned." />
        </Card>
      ) : (
        <Card title="Check out to a patron">
          <form onSubmit={borrow} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <FormField label="Patron" required className="min-w-0">
              <select id="borrow-member" className="field" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">Select patron…</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.studentId ? ` · ${m.studentId}` : ""}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Loan days">
              <select id="borrow-days" className="field" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[7, 14, 21, 30].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </FormField>
            <Button type="submit" variant="primary" busy={busy} disabled={!memberId}>
              Confirm borrow
            </Button>
          </form>
          {memberId && (
            <p className="text-muted mt-3 text-sm">
              {memberLoans.length} of {loanCap} active loans for this patron.
            </p>
          )}
        </Card>
      )}

      {message && message.bookId === book.id && (
        <Notice tone={message.tone} className="mt-4">
          {message.text}
        </Notice>
      )}
    </div>
  );
}

export default function BorrowPage() {
  return (
    <Suspense fallback={<div className="skeleton h-9 w-56" aria-busy="true" aria-label="Loading" />}>
      <BorrowInner />
    </Suspense>
  );
}

function StudentBorrowPanel({ bookId, available }: { bookId: string; available: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function requestToBorrow() {
    setState("busy");
    setMessage("");
    try {
      const res = await fetch("/api/borrow-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ bookId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not submit request.");
      setState("done");
      setMessage("Request sent. A librarian will approve it, and we’ll notify you when it’s ready for pickup.");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Could not submit request.");
    }
  }

  async function placeHold() {
    setState("busy");
    try {
      const res = await fetch("/api/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ bookId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not place hold.");
      setState("done");
      setMessage(`Hold placed. You are #${body.hold.priority} in the queue; we’ll notify you when it’s ready.`);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Could not place hold.");
    }
  }

  if (state === "done") {
    return (
      <Card>
        <Notice tone="ok">{message}</Notice>
        <ButtonLink href="/my-loans" variant="primary">
          View my loans
        </ButtonLink>
      </Card>
    );
  }

  return (
    <Card>
      {state === "error" && <Notice tone="danger">{message}</Notice>}
      {available ? (
        <>
          <p>This book is available. Request it and a librarian will approve it for pickup.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={requestToBorrow} busy={state === "busy"} busyLabel="Sending…">
              Request to borrow
            </Button>
            <Button onClick={placeHold} disabled={state === "busy"}>
              Place a hold for later
            </Button>
          </div>
        </>
      ) : (
        <>
          <p>All copies are out. Place a hold and we’ll keep your place in the queue.</p>
          <Button variant="primary" className="mt-3" onClick={placeHold} busy={state === "busy"} busyLabel="Placing…">
            Place a hold
          </Button>
        </>
      )}
    </Card>
  );
}
