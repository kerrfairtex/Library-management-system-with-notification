"use client";

/*
 * Check out: find a patron (name or ID), then find a title and check it out.
 * Shows the patron's current loans against their loan limit.
 */

import { useMemo, useState } from "react";
import { csrfHeaders, useApi } from "@/lib/hooks";
import { useDeskSession } from "@/components/DeskSessionProvider";
import type { Book, Loan, Member } from "@/lib/types";
import { deriveLoanStatus } from "@/lib/loan-status";
import { formatDate } from "@/lib/utils";
import { canAccess } from "@/lib/permissions";
import { statusLabel, statusTone } from "@/lib/status-tone";
import { Badge, Button, ButtonLink, Card, EmptyState, FormField, Notice, PageHeader, Table } from "@/components/ui";

export default function CheckoutPage() {
  const { session: me } = useDeskSession();
  const canManage = me?.user ? canAccess(me.user, "loans.manage") : false;
  const { data: booksData } = useApi<{ books: Book[] }>("/api/books");
  // GET /api/members returns a plain array.
  const { data: membersData } = useApi<Member[]>(canManage ? "/api/members" : null);
  const { data: loansData, reload } = useApi<{ data: Loan[] }>("/api/loans?pageSize=1000");
  const { data: settingsData } = useApi<{
    max_active_loans_per_member: number;
    loan_period_days: number;
    loan_period_options: number[];
    max_loan_days: number;
  }>("/api/settings/circulation");

  const [query, setQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [days, setDays] = useState(settingsData?.loan_period_days ?? 14);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const books = booksData?.books ?? [];
  const members = Array.isArray(membersData) ? membersData : [];
  const loans = loansData?.data ?? [];
  const loanCap = settingsData?.max_active_loans_per_member ?? 3;
  const loanPeriodOptions = settingsData?.loan_period_options ?? [7, 14, 21, 30];

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

  async function checkout(bookId: string) {
    if (!selectedMember) return;
    if (memberLoans.length >= loanCap) {
      setMessage({ tone: "danger", text: `Patron already has the maximum of ${loanCap} active loans.` });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ bookId, memberId: selectedMember.id, days }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Checkout failed.");
      setMessage({
        tone: "ok",
        text: `Checked out "${body.title ?? "the item"}". Due ${formatDate(body.dueAt)}.`,
      });
      setQuery("");
      reload();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Checkout failed." });
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <div>
        <PageHeader title="Check out" />
        <Card>
          <EmptyState title="Librarians and admins only" body="This page is only available to library staff." />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Check out"
        subtitle={selectedMember ? "Now search for the title to lend." : "Start with the patron: scan their card or type a name or ID."}
        action={<ButtonLink href="/circulation/checkin">Switch to check in</ButtonLink>}
      />

      <Card className="mb-4">
        <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end" onSubmit={(e) => e.preventDefault()}>
          <FormField label={selectedMember ? "Title, author or ISBN" : "Patron or title"} className="min-w-0">
            <input
              id="circ-query"
              className="field"
              placeholder={selectedMember ? "Type a title, author or ISBN" : "Scan patron card / student ID, or type a name"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              // Barcode scanners type into the focused field: the desk scan box
              // must be ready the moment the page opens (staff-only page).
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </FormField>
          <FormField label="Loan days">
            <select id="days" className="field" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {loanPeriodOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </FormField>
          {selectedMember && (
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedMember(null);
                setQuery("");
              }}
            >
              Clear patron
            </Button>
          )}
        </form>
      </Card>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {!selectedMember && memberMatches.length > 0 && (
        <Card title="Patron matches" className="mb-4">
          <Table caption="Patron matches" columns={["Patron", "Type", { label: "Select", hideLabel: true }]}>
            {memberMatches.map((m) => (
              <tr key={m.id}>
                <td>
                  <span className="font-semibold">{m.name}</span>{" "}
                  <span className="text-muted">· {m.studentId ?? m.email}</span>
                </td>
                <td>{statusLabel(m.memberType)}</td>
                <td>
                  <Button variant="primary" onClick={() => setSelectedMember(m)}>
                    Select
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {selectedMember && (
        <>
          <Card className="mb-4">
            <p className="eyebrow">Checking out to</p>
            <p className="display mt-1 text-2xl">{selectedMember.name}</p>
            <p className="text-muted mt-1 text-sm">
              {statusLabel(selectedMember.memberType)} · {memberLoans.length} of {loanCap} loans in use
            </p>
          </Card>

          {bookMatches.length > 0 && (
            <Card title="Matching titles" className="mb-4">
              <Table caption="Matching titles" columns={["Title", "Author", "Barcode/ISBN", "Available", { label: "Check out", hideLabel: true }]}>
                {bookMatches.map((b) => (
                  <tr key={b.id}>
                    <td className="font-semibold">{b.title}</td>
                    <td>{b.author}</td>
                    <td>{b.isbn}</td>
                    <td>
                      {b.availableCopies} of {b.totalCopies}
                    </td>
                    <td>
                      <Button variant="primary" disabled={busy || b.availableCopies < 1} onClick={() => checkout(b.id)}>
                        Check out
                      </Button>
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          <Card title="Current loans">
            <Table
              caption={`Current loans for ${selectedMember.name}`}
              columns={["Title", "Barcode", "Due date", "Status"]}
              isEmpty={memberLoans.length === 0}
              empty={{ title: "No current loans", body: "This patron has nothing checked out." }}
            >
              {memberLoans.map((l) => {
                const status = deriveLoanStatus({ status: l.status, due_at: l.dueAt });
                const book = books.find((b) => b.id === l.bookId);
                return (
                  <tr key={l.id}>
                    <td>{book?.title ?? "Unknown title"}</td>
                    <td>{book?.isbn ?? "—"}</td>
                    <td>{formatDate(l.dueAt)}</td>
                    <td>
                      <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
