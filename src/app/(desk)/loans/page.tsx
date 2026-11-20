"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { canAccess, roleLabel } from "@/lib/permissions";
import type { Book, Member, PublicUser } from "@/lib/types";
import type { EnrichedLoan } from "@/lib/utils";
import { apiJson, useApi } from "@/lib/hooks";
import { useDeskSession } from "@/components/DeskSessionProvider";
import { daysUntil, formatDate, overdueFine } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, ErrorState, FormField, Modal, PageHeader, Table } from "@/components/ui";
import { statusLabel } from "@/lib/status-tone";

// Force dynamic rendering - this page needs session and database access
export const dynamic = "force-dynamic";

export default function LoansPage() {
  const { session: me } = useDeskSession();
  const {
    data: loansPage,
    loading,
    error,
    reload,
  } = useApi<{ data: EnrichedLoan[]; total: number; hasMore: boolean }>("/api/loans?pageSize=1000");
  const loans = loansPage?.data;
  // GET /api/books returns { books }; GET /api/members returns an array.
  const { data: booksData } = useApi<{ books: Book[] }>("/api/books");
  const books = booksData?.books;
  const { data: members } = useApi<Member[]>("/api/members");

  const [filter, setFilter] = useState<"all" | "active" | "overdue" | "returned">("all");
  const [open, setOpen] = useState(false);
  const [bookId, setBookId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const canManageLoans = canAccess(me?.user, "loans.manage");

  // All hooks must run before any conditional return (rules of hooks):
  // returning early here while useMemo runs below would crash React when
  // the session loads after first render.
  const availableBooks = useMemo(
    () => (books ?? []).filter((b) => b.availableCopies > 0),
    [books]
  );
  const activeMembers = useMemo(
    () => (members ?? []).filter((m) => m.active),
    [members]
  );

  const filtered = useMemo(() => {
    return (loans ?? []).filter((loan) => {
      if (filter === "all") return true;
      return loan.status === filter;
    });
  }, [loans, filter]);

  const restricted = Boolean(me) && !canManageLoans;

  async function onCheckout(e: FormEvent) {
    e.preventDefault();
    if (!canManageLoans) return;
    setBusy(true);
    setFormError(null);
    try {
      await apiJson("/api/loans", {
        method: "POST",
        body: JSON.stringify({ bookId, memberId, days }),
      });
      setOpen(false);
      setBookId("");
      setMemberId("");
      setDays(7);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  async function onAction(id: string, action: "return" | "renew") {
    if (!canManageLoans) return;
    setBusyId(id);
    setActionError(null);
    try {
      await apiJson(`/api/loans/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "The loan wasn’t updated. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  const FILTERS = [
    ["all", "All"],
    ["active", "On loan"],
    ["overdue", "Overdue"],
    ["returned", "Returned"],
  ] as const;

  return (
    <div>
      <PageHeader
        title="Loans"
        subtitle={
          restricted
            ? "Loans are managed by librarians and admins."
            : "Every loan: renew due dates, take returns, and see what’s overdue."
        }
        action={
          canManageLoans ? (
            <Button
              variant="primary"
              onClick={() => {
                setFormError(null);
                setOpen(true);
              }}
            >
              Check out
            </Button>
          ) : undefined
        }
      />

      {restricted ? (
        <Card>
          <EmptyState
            title="Loans are restricted"
            body={`Signed in as ${roleLabel(me!.user.role)}. Ask library staff to process borrowing or returns.`}
          />
        </Card>
      ) : (
        <>
          <Card>
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Show loans">
              {FILTERS.map(([key, label]) => (
                <Button
                  key={key}
                  variant={filter === key ? "primary" : "ghost"}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </Button>
              ))}
            </div>

            {actionError && <ErrorState message={actionError} />}

            <Table
              caption="Loans"
              columns={["Book", "Patron", "Borrowed", "Due", "Status", "Fine", { label: "Actions", hideLabel: true }]}
              loading={loading}
              error={error}
              onRetry={reload}
              isEmpty={filtered.length === 0}
              empty={{ title: "No loans in this view", body: "Check out a book or pick another filter." }}
            >
              {filtered.map((loan) => {
                const due = daysUntil(loan.dueAt);
                const tone =
                  loan.status === "overdue" ? "danger" : loan.status === "returned" ? "neutral" : due <= 3 ? "warn" : "info";
                return (
                  <tr key={loan.id}>
                    <td className="font-semibold">{loan.book?.title ?? "Unknown title"}</td>
                    <td>
                      <p>{loan.member?.name ?? "Unknown patron"}</p>
                      {loan.member?.memberType === "student" && loan.member.studentId && (
                        <p className="text-muted text-xs">
                          {loan.member.studentId}
                          {loan.member.grade ? ` · ${loan.member.grade}` : ""}
                        </p>
                      )}
                    </td>
                    <td>{formatDate(loan.borrowedAt)}</td>
                    <td>
                      {formatDate(loan.dueAt)}
                      {loan.status !== "returned" && (
                        <p className="text-muted text-xs">
                          {due < 0 ? `${Math.abs(due)} days overdue` : due === 0 ? "Due today" : `${due} days left`}
                        </p>
                      )}
                    </td>
                    <td>
                      <Badge tone={tone}>{statusLabel(loan.status)}</Badge>
                    </td>
                    <td>
                      {loan.status === "overdue" ? (
                        <span className="font-semibold text-[var(--danger)]">₱{overdueFine(loan.dueAt)}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {loan.status !== "returned" && (
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button variant="ghost" busy={busyId === loan.id} onClick={() => onAction(loan.id, "renew")}>
                            Renew
                          </Button>
                          <Button variant="primary" busy={busyId === loan.id} onClick={() => onAction(loan.id, "return")}>
                            Return
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>

          <Modal open={open && canManageLoans} title="Check out a book" onClose={() => setOpen(false)}>
            <form className="space-y-3" onSubmit={onCheckout}>
              {formError && <ErrorState message={formError} />}
              <FormField label="Book" required>
                <select className="field" value={bookId} onChange={(e) => setBookId(e.target.value)}>
                  <option value="">Select an available title</option>
                  {availableBooks.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.title} ({book.availableCopies} left)
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Patron" required>
                <select className="field" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                  <option value="">Select a patron</option>
                  {activeMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.memberType === "student"
                        ? `${member.name}${member.studentId ? ` (${member.studentId})` : ""}`
                        : `${member.name} · ${member.memberType}`}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Loan period (days)" required>
                <input
                  className="field"
                  type="number"
                  min={1}
                  max={60}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                />
              </FormField>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" busy={busy} busyLabel="Checking out…">
                  Confirm checkout
                </Button>
              </div>
            </form>
          </Modal>
        </>
      )}
    </div>
  );
}
