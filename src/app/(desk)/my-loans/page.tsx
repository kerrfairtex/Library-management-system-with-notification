"use client";

/*
 * My loans — self-service page for patrons:
 * current loans with due dates (renewable here, within the rules for the
 * member's type), open holds, and outstanding fines.
 * Also the landing target after placing a hold from the 3D bookshelf.
 */

import { useState } from "react";
import { csrfHeaders, useApi } from "@/lib/hooks";
import { LIBRARY_PHONE } from "@/lib/site";
import { formatDate } from "@/lib/utils";
import { deriveLoanStatus } from "@/lib/loan-status";
import { statusLabel, statusTone } from "@/lib/status-tone";
import { Badge, Button, ButtonLink, Card, ErrorState, KpiRow, Notice, PageHeader, Table } from "@/components/ui";

// Force dynamic rendering - this page needs session and database access
export const dynamic = "force-dynamic";

type MyLoan = {
  id: string;
  book_id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  status: string;
  renewals_count?: number | null;
  books: { title: string; author: string; isbn: string } | null;
  /** null once returned. Computed by GET /api/my-loans. */
  renewal?: {
    canRenew: boolean;
    reason: string | null;
    renewalsLeft: number;
    maxRenewals: number;
    extraDays: number;
  } | null;
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
  bookId: string;
  memberId: string;
  kind: string;
  status: string;
  priority: number;
  placedAt: string;
  expiresAt: string | null;
  isbn: string | null;
  bookTitle: string;
  bookAuthor: string | null;
  memberName: string;
  memberEmail: string | null;
};

function peso(n: string | number) {
  return `₱${Number(n).toFixed(2)}`;
}

export default function MyLoansPage() {
  const { data, loading, error, reload } = useApi<{
    loans: MyLoan[];
    holds: MyHold[];
    borrowRequests: MyBorrowRequest[];
    fines: MyFine[];
  }>("/api/my-loans");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [renewing, setRenewing] = useState<string | null>(null);
  const [renewed, setRenewed] = useState<string | null>(null);

  const loans = data?.loans ?? [];
  const holds = data?.holds ?? [];
  const borrowRequests = data?.borrowRequests ?? [];
  const fines = data?.fines ?? [];
  const open = loans.filter((l) => !l.returned_at);
  const totalOwed = fines.reduce((s, f) => s + Number(f.amount_outstanding), 0);
  // While loading or after an error the sections show that state instead
  // of their "nothing here" message.
  const state = { loading, error, onRetry: reload };

  async function cancelRequest(id: string) {
    setCancelling(id);
    setActionError(null);
    try {
      const res = await fetch("/api/borrow-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ id, action: "cancel" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "The request wasn’t cancelled. Try again.");
      }
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "The request wasn’t cancelled. Try again.");
    } finally {
      setCancelling(null);
    }
  }

  async function renew(loan: MyLoan) {
    setRenewing(loan.id);
    setActionError(null);
    setRenewed(null);
    try {
      const res = await fetch(`/api/my-loans/${loan.id}/renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "The loan wasn’t renewed. Try again.");
      const title = loan.books?.title ?? "Your book";
      const left = typeof body.renewalsLeft === "number" ? body.renewalsLeft : null;
      setRenewed(
        `Renewed “${title}”. It’s now due ${formatDate(body.loan?.dueAt)}.` +
          (left === null ? "" : left === 0 ? " That was your last renewal for this loan." : ` ${left} renewal${left === 1 ? "" : "s"} left.`)
      );
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "The loan wasn’t renewed. Try again.");
    } finally {
      setRenewing(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="My loans"
        subtitle="Books you have, holds, borrow requests and fines."
        action={<ButtonLink href="/books">Search catalog</ButtonLink>}
      />

      <KpiRow
        layout="square"
        loading={loading}
        items={[
          { label: "Books out", value: open.length },
          { label: "Holds waiting", value: holds.length },
          { label: "Fines owed", value: peso(totalOwed), tone: totalOwed > 0 ? "danger" : undefined },
          { label: "Borrow requests", value: borrowRequests.length },
        ]}
      />

      {actionError && <ErrorState message={actionError} />}
      {renewed && <Notice>{renewed}</Notice>}

      <Card title="Checkouts">
        <Table
          caption="Checkouts"
          columns={["Title", "Borrowed", "Due", "Status", "Renew"]}
          {...state}
          isEmpty={loans.length === 0}
          empty={{
            title: "No checkouts yet",
            body: "Books you borrow show here with their due dates.",
            action: <ButtonLink href="/books" variant="primary">Browse the catalog</ButtonLink>,
          }}
        >
          {loans.map((l) => {
            const status = l.returned_at ? "returned" : deriveLoanStatus({ status: l.status as never, due_at: l.due_at });
            return (
              <tr key={l.id}>
                <td>
                  <p className="font-semibold">{l.books?.title ?? "Unknown title"}</p>
                  {l.books?.author && <p className="text-muted text-sm">{l.books.author}</p>}
                </td>
                <td>{formatDate(l.borrowed_at)}</td>
                <td>{formatDate(l.due_at)}</td>
                <td>
                  <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
                </td>
                <td>
                  {l.renewal && (
                    <div className="max-w-[16rem]">
                      {l.renewal.canRenew ? (
                        <Button
                          busy={renewing === l.id}
                          busyLabel="Renewing…"
                          onClick={() => renew(l)}
                          aria-label={`Renew ${l.books?.title ?? "this book"} for ${l.renewal.extraDays} days`}
                        >
                          Renew
                        </Button>
                      ) : (
                        <p className="text-muted text-sm">{l.renewal.reason}</p>
                      )}
                      {l.renewal.maxRenewals > 0 && (
                        <p className="text-muted mt-1 text-xs">
                          {l.renewal.renewalsLeft} of {l.renewal.maxRenewals} renewals left
                        </p>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Card title="Holds">
        <Table
          caption="Holds"
          columns={["Title", "Placed on", "Queue position", "Status"]}
          {...state}
          isEmpty={holds.length === 0}
          empty={{ title: "No open holds", body: "Place a hold on a book that’s out and we’ll tell you when it’s ready." }}
        >
          {holds.map((h) => (
            <tr key={h.id}>
              <td className="font-semibold">{h.books?.title ?? "Unknown title"}</td>
              <td>{formatDate(h.placed_at)}</td>
              <td>#{h.priority}</td>
              <td>
                <Badge tone={statusTone(h.status)}>{statusLabel(h.status)}</Badge>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="Borrow requests">
        <Table
          caption="Borrow requests"
          columns={["Title", "Requested on", "Status", { label: "Actions", hideLabel: true }]}
          {...state}
          isEmpty={borrowRequests.length === 0}
          empty={{ title: "No borrow requests", body: "Request a book that’s on the shelf and a librarian will approve it." }}
        >
          {borrowRequests.map((r: MyBorrowRequest) => (
            <tr key={r.id}>
              <td className="font-semibold">{r.bookTitle ?? "Unknown title"}</td>
              <td>{formatDate(r.placedAt)}</td>
              <td>
                <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
              </td>
              <td>
                {r.status === "pending" && (
                  <Button busy={cancelling === r.id} busyLabel="Cancelling…" onClick={() => cancelRequest(r.id)}>
                    Cancel
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="Fines">
        <Table
          caption="Fines"
          columns={["Description", "Date", "Amount", "Outstanding"]}
          {...state}
          isEmpty={fines.length === 0}
          empty={{ title: "No outstanding fines", body: "Keep returning books on time." }}
        >
          {fines.map((f) => (
            <tr key={f.id}>
              <td>{f.description ?? "Library fine"}</td>
              <td>{formatDate(f.created_at)}</td>
              <td>{peso(f.amount)}</td>
              <td className="font-semibold">{peso(f.amount_outstanding)}</td>
            </tr>
          ))}
        </Table>
        {fines.length > 0 && (
          <p className="text-muted mt-3 text-sm">
            Settle fines at the library desk. Questions?{" "}
            <a className="link" href={`tel:${LIBRARY_PHONE}`}>
              Call the library desk
            </a>
            .
          </p>
        )}
      </Card>
    </div>
  );
}
