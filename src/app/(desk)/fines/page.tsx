"use client";

/*
 * Fines desk — staff screen: all outstanding fines, mark paid or waive.
 */

import { useApi } from "@/lib/hooks";
import { formatDate } from "@/lib/utils";
import { useState } from "react";

type Fine = {
  id: string;
  member_id: string;
  type: string;
  amount: string | number;
  amount_outstanding: string | number;
  description: string | null;
  created_at: string;
  paid_at: string | null;
};

function peso(n: string | number) {
  return `₱${Number(n).toFixed(2)}`;
}

export default function FinesPage() {
  const { data, loading, reload } = useApi<{ fines: Fine[] }>("/api/fines");
  const { data: membersData } = useApi<{ members: { id: string; name: string }[] }>("/api/members");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showPaid, setShowPaid] = useState(false);

  const fines = (data?.fines ?? []).filter((f) => showPaid || !f.paid_at);
  const members = membersData?.members ?? [];
  const totalOutstanding = fines
    .filter((f) => !f.paid_at)
    .reduce((s, f) => s + Number(f.amount_outstanding), 0);

  async function settle(id: string, action: "pay" | "waive") {
    setBusyId(id);
    try {
      await fetch("/api/fines", {
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
        <h1 className="page-title">Fines desk</h1>
        <label style={{ fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <input
            type="checkbox"
            checked={showPaid}
            onChange={(e) => setShowPaid(e.target.checked)}
          />
          Show settled
        </label>
      </div>

      <section className="circ-card" style={{ marginBottom: "1.1rem" }}>
        <h3>Total outstanding</h3>
        <p style={{ fontSize: "1.6rem", fontWeight: 700, color: "#8c1d1d" }}>
          {peso(totalOutstanding)}
        </p>
      </section>

      <section className="koha-table-wrap">
        <table className="koha-table">
          <thead>
            <tr>
              <th>Patron</th>
              <th>Description</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Outstanding</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6}>Loading fines…</td></tr>}
            {!loading && fines.length === 0 && (
              <tr><td colSpan={6}>No fines on record.</td></tr>
            )}
            {fines.map((f) => (
              <tr key={f.id}>
                <td>{members.find((m) => m.id === f.member_id)?.name ?? f.member_id}</td>
                <td>{f.description ?? f.type}</td>
                <td>{formatDate(f.created_at)}</td>
                <td>{peso(f.amount)}</td>
                <td style={{ fontWeight: 700 }}>
                  {f.paid_at ? <span className="chip chip-available">settled</span> : peso(f.amount_outstanding)}
                </td>
                <td>
                  {!f.paid_at && (
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <button
                        type="button"
                        className="btn-koha"
                        disabled={busyId === f.id}
                        onClick={() => settle(f.id, "pay")}
                      >
                        Mark paid
                      </button>
                      <button
                        type="button"
                        className="btn-koha secondary"
                        disabled={busyId === f.id}
                        onClick={() => settle(f.id, "waive")}
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
      </section>
    </div>
  );
}
