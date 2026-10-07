"use client";

/*
 * Holds queue + borrow requests — staff screen.
 * Koha circ/view_holdsqueue.tt equivalent, extended with student borrow
 * requests so staff can approve/reject/checkout from one queue.
 */

import { useApi } from "@/lib/hooks";
import { useDeskSession } from "@/components/DeskSessionProvider";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { useState } from "react";
import { canAccess } from "@/lib/permissions";

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
  const canManage = me?.user ? canAccess(me.user as any, "loans.manage") : false;
  const { data, loading, reload } = useApi<{ holds: HoldRow[] }>("/api/holds");
  const requestsApi = useApi<{ requests: BorrowRequestRow[] }>("/api/borrow-requests");
  const requestsData = requestsApi?.data;
  const reqLoading = requestsApi?.loading ?? false;
  const { data: booksData } = useApi<{ books: { id: string; title: string }[] }>("/api/books");
  const { data: membersData } = useApi<{ members: { id: string; name: string }[] }>("/api/members");
  const [busy, setBusy] = useState<string | null>(null);

  const holds = data?.holds ?? [];
  const requests = (requestsData && requestsData.requests) ?? [];
  const books = booksData?.books ?? [];
  const members = membersData?.members ?? [];
  const isLoading = loading || reqLoading;

  async function act(id: string, action: string, isRequest = false) {
    setBusy(id);
    try {
      const url = isRequest ? "/api/borrow-requests" : "/api/holds";
      await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (isRequest) {
        window.location.reload();
      } else {
        reload();
      }
    } finally {
      setBusy(null);
    }
  }

  async function checkoutRequest(id: string) {
    setBusy(id);
    try {
      await fetch("/api/borrow-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "checkout", days: 14 }),
      });
      window.location.reload();
    } finally {
      setBusy(null);
    }
  }

  function chipClass(status: string, kind?: string) {
    if (kind === "borrow_request") {
      return status === "pending" ? "chip chip-overdue"
        : status === "ready" ? "chip chip-available"
        : status === "fulfilled" ? "chip chip-available"
        : status === "rejected" ? "chip chip-overdue"
        : "chip chip-tone-info";
    }
    return `chip chip-${status}`;
  }

  if (!canManage) {
    return (
      <div>
        <div className="page-head">
          <h1 className="page-title">Holds & borrow requests</h1>
        </div>
        <section className="circ-card">
          <p>This page is only available to librarians and admins.</p>
        </section>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Holds & borrow requests</h1>
        <Link href="/circulation" className="btn-koha secondary">
          Back to circulation
        </Link>
      </div>

      <section className="circ-card" style={{ marginBottom: "1rem" }}>
        <p style={{ opacity: 0.8, fontSize: "0.9rem" }}>
          Pending holds and borrow requests. Approve a borrow request to mark it ready for pickup,
          then check it out to create the loan.
        </p>
      </section>

      <section className="koha-table-wrap">
        <table className="koha-table">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Title</th>
              <th>Patron</th>
              <th>Placed on</th>
              <th>Type</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7}>Loading...</td></tr>
            )}
            {!isLoading && holds.length === 0 && requests.length === 0 && (
              <tr><td colSpan={7}>No holds or borrow requests.</td></tr>
            )}
            {holds.map((h) => (
              <tr key={h.id}>
                <td>#{h.priority}</td>
                <td><strong>{books.find((b) => b.id === h.book_id)?.title ?? h.book_id}</strong></td>
                <td>{members.find((m) => m.id === h.member_id)?.name ?? h.member_id}</td>
                <td>{formatDate(h.placed_at)}</td>
                <td><span style={{ fontSize: "0.75rem", opacity: 0.7 }}>Hold</span></td>
                <td><span className={chipClass(h.status, h.kind)}>{h.status}</span></td>
                <td>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button
                      type="button"
                      className="btn-koha"
                      disabled={busy === h.id}
                      onClick={() => act(h.id, "fulfill")}
                    >
                      Fulfill
                    </button>
                    <button
                      type="button"
                      className="btn-koha secondary"
                      disabled={busy === h.id}
                      onClick={() => act(h.id, "cancel")}
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {requests.map((r) => {
              const isBusy = busy === r.id;
              return (
                <tr key={r.id} style={{ borderTop: "1px dashed #ccc" }}>
                  <td>#{r.priority}</td>
                  <td><strong>{books.find((b) => b.id === r.bookId)?.title ?? r.bookId}</strong></td>
                  <td>{members.find((m) => m.id === r.memberId)?.name ?? r.memberId}</td>
                  <td>{formatDate(r.placedAt)}</td>
                  <td><span style={{ fontSize: "0.75rem", opacity: 0.7 }}>Request</span></td>
                  <td><span className={chipClass(r.status, r.kind)}>{r.status}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                      {r.status === "pending" && (
                        <>
                          <button
                            type="button"
                            className="btn-koha"
                            disabled={isBusy}
                            onClick={() => act(r.id, "approve", true)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn-koha secondary"
                            disabled={isBusy}
                            onClick={() => {
                              const reason = window.prompt("Rejection reason (optional):") || undefined;
                              fetch("/api/borrow-requests", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: r.id, action: "reject", reason }),
                              }).then(() => window.location.reload());
                            }}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {r.status === "ready" && (
                        <button
                          type="button"
                          className="btn-koha"
                          disabled={isBusy}
                          onClick={() => checkoutRequest(r.id)}
                        >
                          Check Out
                        </button>
                      )}
                      {["pending", "ready"].includes(r.status) && (
                        <button
                          type="button"
                          className="btn-koha secondary"
                          disabled={isBusy}
                          onClick={() => act(r.id, "cancel", true)}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
