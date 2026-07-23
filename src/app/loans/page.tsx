"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Book, Member } from "@/lib/types";
import type { EnrichedLoan } from "@/lib/utils";
import { apiJson, useApi } from "@/lib/hooks";
import { daysUntil, formatDate } from "@/lib/utils";
import { EmptyState, ErrorBanner, Modal, PageHeader } from "@/components/ui";

export default function LoansPage() {
  const {
    data: loans,
    loading,
    error,
    reload,
  } = useApi<EnrichedLoan[]>("/api/loans");
  const { data: books } = useApi<Book[]>("/api/books");
  const { data: members } = useApi<Member[]>("/api/members");

  const [filter, setFilter] = useState<"all" | "active" | "overdue" | "returned">("all");
  const [open, setOpen] = useState(false);
  const [bookId, setBookId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  async function onCheckout(e: FormEvent) {
    e.preventDefault();
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
      setDays(14);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  async function onAction(id: string, action: "return" | "renew") {
    try {
      await apiJson(`/api/loans/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      await reload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Circulation"
        subtitle="Check out titles, renew due dates, and return books with automatic alerts."
        action={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setFormError(null);
              setOpen(true);
            }}
          >
            Check out
          </button>
        }
      />

      <div className="panel p-4 md:p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {(["all", "active", "overdue", "returned"] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={`btn ${filter === key ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setFilter(key)}
            >
              {key}
            </button>
          ))}
        </div>

        {error && <ErrorBanner message={error} />}
        {loading && <p className="text-sm">Loading loans…</p>}

        {!loading && filtered.length === 0 ? (
          <EmptyState
            title="No loans in this view"
            body="Check out a book or switch filters to see circulation history."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Member</th>
                  <th>Borrowed</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((loan) => {
                  const due = daysUntil(loan.dueAt);
                  return (
                    <tr key={loan.id}>
                      <td className="font-semibold">{loan.book?.title ?? "Unknown"}</td>
                      <td>{loan.member?.name ?? "Unknown"}</td>
                      <td>{formatDate(loan.borrowedAt)}</td>
                      <td>
                        {formatDate(loan.dueAt)}
                        {loan.status !== "returned" && (
                          <p className="text-xs text-[color-mix(in_srgb,var(--ink)_50%,transparent)]">
                            {due < 0
                              ? `${Math.abs(due)} days overdue`
                              : due === 0
                                ? "Due today"
                                : `${due} days left`}
                          </p>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            loan.status === "overdue"
                              ? "tone-danger"
                              : loan.status === "returned"
                                ? "tone-ok"
                                : due <= 3
                                  ? "tone-warn"
                                  : "tone-info"
                          }`}
                        >
                          {loan.status}
                        </span>
                      </td>
                      <td>
                        {loan.status !== "returned" && (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => onAction(loan.id, "renew")}
                            >
                              Renew
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => onAction(loan.id, "return")}
                            >
                              Return
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={open} title="Check out a book" onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={onCheckout}>
          {formError && <ErrorBanner message={formError} />}
          <div>
            <label className="label" htmlFor="bookId">
              Book
            </label>
            <select
              id="bookId"
              className="field"
              required
              value={bookId}
              onChange={(e) => setBookId(e.target.value)}
            >
              <option value="">Select an available title</option>
              {availableBooks.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title} ({book.availableCopies} left)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="memberId">
              Member
            </label>
            <select
              id="memberId"
              className="field"
              required
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              <option value="">Select a member</option>
              {activeMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="days">
              Loan period (days)
            </label>
            <input
              id="days"
              className="field"
              type="number"
              min={1}
              max={60}
              required
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Checking out…" : "Confirm checkout"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
