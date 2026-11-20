"use client";

/*
 * Holds & borrow requests. Staff approve, reject, check out, fulfil or
 * cancel from one queue; patrons see and cancel their own.
 */

import { useApi } from "@/lib/hooks";
import { useDeskSession } from "@/components/DeskSessionProvider";
import { formatDate } from "@/lib/utils";
import { useState } from "react";
import { canAccess } from "@/lib/permissions";
import { statusLabel, statusTone } from "@/lib/status-tone";
import { Badge, Button, ButtonLink, Card, ErrorState, PageHeader, Table, useDialogs } from "@/components/ui";

// Force dynamic rendering - this page needs session and database access
export const dynamic = "force-dynamic";

type BorrowRequestRow = {
  id: string;
  bookId: string;
  memberId: string;
  status: string;
  priority: number;
  placedAt: string;
  kind?: string;
  expiresAt?: string;
  isbn: string | null;
  bookTitle: string;
  bookAuthor: string | null;
  memberName: string;
  memberEmail: string | null;
};

type HoldRow = {
  id: string;
  book_id: string;
  member_id: string;
  status: string;
  priority: number;
  placed_at: string;
  kind?: string;
  expires_at?: string;
};

export default function HoldsPage() {
  const { session: me } = useDeskSession();
  const canManage = me?.user ? canAccess(me.user, "loans.manage") : false;
  const { data, loading, error, reload } = useApi<{ holds: HoldRow[] }>("/api/holds");
  const requestsApi = useApi<{ requests: BorrowRequestRow[] }>("/api/borrow-requests");
  const { data: booksData } = useApi<{ books: { id: string; title: string }[] }>("/api/books");
  // /api/members returns a plain array (staff only); patrons never load it.
  const { data: membersData } = useApi<{ id: string; name: string }[]>(canManage ? "/api/members" : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const dialogs = useDialogs();

  const holds = data?.holds ?? [];
  const requests = requestsApi.data?.requests ?? [];
  const books = booksData?.books ?? [];
  const members = Array.isArray(membersData) ? membersData : [];
  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "Unknown patron";
  const bookTitle = (id: string) => books.find((b) => b.id === id)?.title ?? "Unknown title";
  // /api/holds also returns open borrow requests; they're listed once, from
  // /api/borrow-requests, so drop them here to avoid duplicate rows.
  const staffHolds = holds.filter((h) => h.kind !== "borrow_request");
  const isLoading = loading || requestsApi.loading;
  const loadError = error || requestsApi.error;
  const reloadAll = () => {
    void reload();
    void requestsApi.reload();
  };

  async function send(id: string, isRequest: boolean, payload: Record<string, unknown>) {
    setBusy(id);
    setActionError(null);
    try {
      const res = await fetch(isRequest ? "/api/borrow-requests" : "/api/holds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "That didn’t go through. Try again.");
      }
      reloadAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "That didn’t go through. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const act = (id: string, action: string, isRequest = false) => send(id, isRequest, { action });
  const checkoutRequest = (id: string) => send(id, true, { action: "checkout", days: 14 });

  async function reject(id: string) {
    const reason = await dialogs.prompt({
      title: "Reject this request?",
      message: "The patron is notified. A reason helps them understand.",
      label: "Reason (optional)",
      multiline: true,
      confirmLabel: "Reject request",
      danger: true,
    });
    if (reason === null) return;
    await send(id, true, { action: "reject", reason: reason.trim() || undefined });
  }

  if (!canManage) {
    const myHolds = holds.filter((h) => h.kind !== "borrow_request");
    const rows = [
      ...myHolds.map((h) => ({
        id: h.id,
        title: bookTitle(h.book_id),
        type: "Hold",
        placed: h.placed_at,
        status: h.status,
        isRequest: false,
      })),
      ...requests.map((r) => ({
        id: r.id,
        title: r.bookTitle,
        type: "Borrow request",
        placed: r.placedAt,
        status: r.status,
        isRequest: true,
      })),
    ];
    return (
      <div>
        <PageHeader
          title="My holds & requests"
          subtitle="Books you’re waiting for and requests waiting for a librarian."
          action={<ButtonLink href="/books">Search catalog</ButtonLink>}
        />
        {actionError && <ErrorState message={actionError} />}
        <Card>
          <Table
            caption="My holds and borrow requests"
            columns={["Title", "Type", "Placed on", "Status", { label: "Actions", hideLabel: true }]}
            loading={isLoading}
            error={loadError}
            onRetry={reloadAll}
            isEmpty={rows.length === 0}
            empty={{
              title: "No holds or requests",
              body: "Place a hold on a book that’s out, or request one that’s on the shelf.",
              action: <ButtonLink href="/books" variant="primary">Browse the catalog</ButtonLink>,
            }}
          >
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-semibold">{r.title}</td>
                <td>{r.type}</td>
                <td>{formatDate(r.placed)}</td>
                <td>
                  <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
                </td>
                <td>
                  {(r.status === "pending" || r.status === "ready") && (
                    <Button busy={busy === r.id} busyLabel="Cancelling…" onClick={() => act(r.id, "cancel", r.isRequest)}>
                      Cancel
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Holds & requests"
        subtitle="Approve a borrow request to mark it ready for pickup, then check it out to create the loan."
        action={<ButtonLink href="/circulation">Back to circulation</ButtonLink>}
      />
      {actionError && <ErrorState message={actionError} />}
      <Card>
        <Table
          caption="Holds and borrow requests"
          columns={["Priority", "Title", "Patron", "Placed on", "Type", "Status", { label: "Actions", hideLabel: true }]}
          loading={isLoading}
          error={loadError}
          onRetry={reloadAll}
          isEmpty={staffHolds.length === 0 && requests.length === 0}
          empty={{ title: "No holds or requests", body: "New holds and borrow requests appear here." }}
        >
          {staffHolds.map((h) => (
            <tr key={h.id}>
              <td>#{h.priority}</td>
              <td className="font-semibold">{bookTitle(h.book_id)}</td>
              <td>{memberName(h.member_id)}</td>
              <td>{formatDate(h.placed_at)}</td>
              <td>Hold</td>
              <td>
                <Badge tone={statusTone(h.status)}>{statusLabel(h.status)}</Badge>
              </td>
              <td>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="primary" disabled={busy === h.id} onClick={() => act(h.id, "fulfill")}>
                    Fulfill
                  </Button>
                  <Button disabled={busy === h.id} onClick={() => act(h.id, "cancel")}>
                    Cancel
                  </Button>
                </div>
              </td>
            </tr>
          ))}
          {requests.map((r) => {
            const isBusy = busy === r.id;
            return (
              <tr key={r.id}>
                <td>#{r.priority}</td>
                <td className="font-semibold">{r.bookTitle || bookTitle(r.bookId)}</td>
                <td>{r.memberName || memberName(r.memberId)}</td>
                <td>{formatDate(r.placedAt)}</td>
                <td>Request</td>
                <td>
                  <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
                </td>
                <td>
                  <div className="flex flex-wrap justify-end gap-2">
                    {r.status === "pending" && (
                      <>
                        <Button variant="primary" disabled={isBusy} onClick={() => act(r.id, "approve", true)}>
                          Approve
                        </Button>
                        <Button variant="danger" disabled={isBusy} onClick={() => reject(r.id)}>
                          Reject
                        </Button>
                      </>
                    )}
                    {r.status === "ready" && (
                      <Button variant="primary" disabled={isBusy} onClick={() => checkoutRequest(r.id)}>
                        Check out
                      </Button>
                    )}
                    {["pending", "ready"].includes(r.status) && (
                      <Button disabled={isBusy} onClick={() => act(r.id, "cancel", true)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
      {dialogs.element}
    </div>
  );
}
