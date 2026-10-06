"use client";

/*
 * Fines desk — staff screen: all outstanding fines, mark paid or waive.
 */

import { useApi } from "@/lib/hooks";
import { formatDate } from "@/lib/utils";
import { useState } from "react";
import { canAccess } from "@/lib/permissions";
import type { Fine, Member } from "@/lib/types";
import { ErrorBanner, PageHeader } from "@/components/ui";

// Force dynamic rendering - this page needs session and database access
export const dynamic = "force-dynamic";

function peso(n: number) {
  return `₱${n.toFixed(2)}`;
}

export default function FinesPage() {
  const { data: me } = useApi<{ user: { role: string } }>("/api/auth/me");
  const canManage = me?.user ? canAccess(me.user as any, "loans.manage") : false;
  const { data, loading, reload } = useApi<{ fines: Fine[]; members: Member[] }>("/api/fines");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showPaid, setShowPaid] = useState(false);

  const fines = (data?.fines ?? []).filter((f) => showPaid || f.amountOutstanding > 0);
  const members = data?.members ?? [];
  const totalOutstanding = fines
    .filter((f) => f.amountOutstanding > 0)
    .reduce((s, f) => s + f.amountOutstanding, 0);

  async function settle(id: string, action: "pay" | "forgive", amount?: number) {
    setBusyId(id);
    try {
      if (action === "pay") {
        await fetch(`/api/fines/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pay", amount }),
        });
      } else {
        await fetch(`/api/fines/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "forgive" }),
        });
      }
      reload();
    } finally {
      setBusyId(null);
    }
  }

  if (!canManage) {
    return (
      <div>
        <PageHeader title="Fines desk" subtitle="Manage and track library fines" />
        <section className="panel p-5">
          <p>This page is only available to librarians and admins.</p>
        </section>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Fines desk"
        subtitle="All fines and payments"
        action={
          <label style={{ fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <input
              type="checkbox"
              checked={showPaid}
              onChange={(e) => setShowPaid(e.target.checked)}
            />
            Show settled
          </label>
        }
      />

      <section className="panel p-5" style={{ marginBottom: "1.1rem" }}>
        <h3>Total outstanding</h3>
        <p style={{ fontSize: "1.6rem", fontWeight: 700, color: "#8c1d1d" }}>
          {peso(totalOutstanding)}
        </p>
      </section>

      <section className="panel p-5">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Patron</th>
                <th>Type</th>
                <th>Description</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Outstanding</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8}>Loading fines…</td></tr>}
              {!loading && fines.length === 0 && (
                <tr><td colSpan={8}>No fines on record.</td></tr>
              )}
              {fines.map((f) => (
                <tr key={f.id}>
                  <td>{members.find((m) => m.id === f.memberId)?.name ?? f.memberId}</td>
                  <td><span className="badge tone-info">{f.type}</span></td>
                  <td>{f.description ?? "—"}</td>
                  <td>{formatDate(f.createdAt)}</td>
                  <td>{peso(f.amount)}</td>
                  <td style={{ fontWeight: 700 }}>{peso(f.amountOutstanding)}</td>
                  <td>
                    {f.paidAt ? (
                      <span className="badge tone-ok">Paid {formatDate(f.paidAt)}</span>
                    ) : (
                      <span className="badge tone-warn">Outstanding</span>
                    )}
                  </td>
                  <td>
                    {!f.paidAt && (
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busyId === f.id}
                          onClick={() => settle(f.id, "pay", f.amountOutstanding)}
                        >
                          {busyId === f.id ? "Paying…" : "Mark paid"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busyId === f.id}
                          onClick={() => settle(f.id, "forgive")}
                        >
                          Waive
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
