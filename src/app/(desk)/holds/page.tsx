"use client";

/*
 * Holds queue — staff screen (Koha circ/view_holdsqueue.tt equivalent).
 * Shows pending/ready holds with patron + title, cancel/fulfill actions.
 */

import { useApi } from "@/lib/hooks";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { useState } from "react";

type Hold = {
  id: string;
  book_id: string;
  member_id: string;
  status: string;
  priority: number;
  placed_at: string;
};

export default function HoldsPage() {
  const { data, loading, reload } = useApi<{ holds: Hold[] }>("/api/holds");
  const { data: booksData } = useApi<{ books: { id: string; title: string }[] }>("/api/books");
  const { data: membersData } = useApi<{ members: { id: string; name: string }[] }>("/api/members");
  const [busyId, setBusyId] = useState<string | null>(null);

  const holds = data?.holds ?? [];
  const books = booksData?.books ?? [];
  const members = membersData?.members ?? [];

  async function act(id: string, action: "cancel" | "fulfill") {
    setBusyId(id);
    try {
      await fetch("/api/holds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Holds queue</h1>
        <Link href="/circulation" className="btn-koha secondary">
          ← Circulation
        </Link>
      </div>

      <section className="koha-table-wrap">
        <table className="koha-table">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Title</th>
              <th>Patron</th>
              <th>Placed on</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6}>Loading holds…</td></tr>
            )}
            {!loading && holds.length === 0 && (
              <tr><td colSpan={6}>The holds queue is empty.</td></tr>
            )}
            {holds.map((h) => (
              <tr key={h.id}>
                <td>#{h.priority}</td>
                <td><strong>{books.find((b) => b.id === h.book_id)?.title ?? h.book_id}</strong></td>
                <td>{members.find((m) => m.id === h.member_id)?.name ?? h.member_id}</td>
                <td>{formatDate(h.placed_at)}</td>
                <td><span className={`chip chip-${h.status}`}>{h.status}</span></td>
                <td>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button
                      type="button"
                      className="btn-koha"
                      disabled={busyId === h.id}
                      onClick={() => act(h.id, "fulfill")}
                    >
                      Fulfill
                    </button>
                    <button
                      type="button"
                      className="btn-koha secondary"
                      disabled={busyId === h.id}
                      onClick={() => act(h.id, "cancel")}
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
