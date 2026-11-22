"use client";

/*
 * Check in: scan a barcode/ISBN (or type a title), return the open loan,
 * and list what was checked in during this visit.
 */

import { useState } from "react";
import { csrfHeaders, useApi } from "@/lib/hooks";
import { useDeskSession } from "@/components/DeskSessionProvider";
import type { Book, Loan, Member } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { canAccess } from "@/lib/permissions";
import { Badge, Button, ButtonLink, Card, EmptyState, FormField, Notice, PageHeader, Table } from "@/components/ui";

// Force dynamic rendering - this page needs session and database access
export const dynamic = "force-dynamic";

type CheckinResult = {
  title: string;
  author: string;
  isbn: string;
  wasOverdue: boolean;
  returnedAt: string;
};

export default function CheckinPage() {
  const { session: me } = useDeskSession();
  const canManage = me?.user ? canAccess(me.user, "loans.manage") : false;
  const { data: booksData } = useApi<{ books: Book[] }>("/api/books");
  // GET /api/members returns a plain array.
  const { data: membersData } = useApi<Member[]>(canManage ? "/api/members" : null);
  const { data: loansData, reload } = useApi<{ data: Loan[] }>("/api/loans?pageSize=1000");

  const [barcode, setBarcode] = useState("");
  const [results, setResults] = useState<CheckinResult[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const books = booksData?.books ?? [];
  const members = Array.isArray(membersData) ? membersData : [];
  const loans = loansData?.data ?? [];

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
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
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
      setMessage({ tone: "ok", text: `Checked in "${book.title}" from ${member?.name ?? "the patron"}.` });
      setBarcode("");
      reload();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Check-in failed." });
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <div>
        <PageHeader title="Check in" />
        <Card>
          <EmptyState title="Librarians and admins only" body="This page is only available to library staff." />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Check in"
        subtitle="Scan or type each returned book."
        action={<ButtonLink href="/circulation/checkout">Switch to check out</ButtonLink>}
      />

      <Card className="mb-4">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={checkin}>
          <FormField label="Item" className="min-w-0 flex-1">
            <input
              id="checkin-barcode"
              className="field"
              placeholder="Scan barcode / ISBN, or type a title"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              autoComplete="off"
              // Barcode scanners type into the focused field: the desk scan box
              // must be ready the moment the page opens (staff-only page).
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </FormField>
          <Button type="submit" variant="primary" busy={busy} busyLabel="Checking in…">
            Check in
          </Button>
        </form>
      </Card>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <Card title="Checked in this visit">
        <Table
          caption="Checked in this visit"
          columns={["Title", "Author", "Barcode", "Status", "Returned"]}
          isEmpty={results.length === 0}
          empty={{ title: "Nothing checked in yet", body: "Returned books appear here as you scan them." }}
        >
          {results.map((r, i) => (
            <tr key={i}>
              <td className="font-semibold">{r.title}</td>
              <td>{r.author}</td>
              <td>{r.isbn}</td>
              <td>{r.wasOverdue ? <Badge tone="danger">Was overdue</Badge> : <Badge tone="ok">On time</Badge>}</td>
              <td>{formatDate(r.returnedAt)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
