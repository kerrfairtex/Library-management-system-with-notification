"use client";

/*
 * Fines. Staff: every fine, mark paid or waive. Patrons: their own fines.
 */

import { csrfHeaders, useApi } from "@/lib/hooks";
import { useDeskSession } from "@/components/DeskSessionProvider";
import { formatDate } from "@/lib/utils";
import { useState } from "react";
import { canAccess } from "@/lib/permissions";
import type { Fine, Member } from "@/lib/types";
import { statusLabel } from "@/lib/status-tone";
import { Badge, Button, Card, ErrorState, PageHeader, StatGrid, Table } from "@/components/ui";

// Force dynamic rendering - this page needs session and database access
export const dynamic = "force-dynamic";

function peso(n: number) {
  return `₱${n.toFixed(2)}`;
}

function FineStatus({ fine }: { fine: Fine }) {
  return fine.paidAt ? <Badge tone="ok">Paid {formatDate(fine.paidAt)}</Badge> : <Badge tone="warn">Outstanding</Badge>;
}

export default function FinesPage() {
  const { session: me } = useDeskSession();
  const canManage = me?.user ? canAccess(me.user, "loans.manage") : false;
  const { data, loading, error, reload } = useApi<{ fines: Fine[]; members: Member[] }>("/api/fines");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fines = (data?.fines ?? []).filter((f) => showPaid || f.amountOutstanding > 0);
  const members = data?.members ?? [];
  const totalOutstanding = fines
    .filter((f) => f.amountOutstanding > 0)
    .reduce((s, f) => s + f.amountOutstanding, 0);

  async function settle(id: string, action: "pay" | "forgive", amount?: number) {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/fines/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify(action === "pay" ? { action: "pay", amount } : { action: "forgive" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? (action === "pay" ? "The payment wasn’t recorded." : "The fine wasn’t waived."));
      }
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "That didn’t go through. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (!canManage) {
    const mine = data?.fines ?? [];
    const owed = mine.reduce((sum, f) => sum + f.amountOutstanding, 0);
    return (
      <div className="space-y-5">
        <PageHeader title="My fines" subtitle="Your charges and payments. Pay at the library desk." />
        <StatGrid wide={2}
          loading={loading}
          items={[
            { label: "Total you owe", value: peso(owed), tone: owed > 0 ? "danger" : undefined, hint: owed > 0 ? "Pay at the library desk" : "You’re all clear" },
          ]}
        />
        <Card title="Charges">
          <Table
            caption="My fines"
            columns={["Type", "Description", "Date", "Amount", "Outstanding", "Status"]}
            loading={loading}
            error={error}
            onRetry={reload}
            isEmpty={mine.length === 0}
            empty={{ title: "No fines", body: "Return books on time and this stays empty." }}
          >
            {mine.map((f) => (
              <tr key={f.id}>
                <td><Badge tone="info">{statusLabel(f.type)}</Badge></td>
                <td>{f.description ?? "—"}</td>
                <td>{formatDate(f.createdAt)}</td>
                <td>{peso(f.amount)}</td>
                <td className="font-semibold">{peso(f.amountOutstanding)}</td>
                <td><FineStatus fine={f} /></td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fines"
        subtitle="All fines and payments."
        action={
          <label className="inline-flex min-h-[var(--tap)] items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} />
            Show settled
          </label>
        }
      />

      <StatGrid wide={2}
        loading={loading}
        items={[
          { label: "Total outstanding", value: peso(totalOutstanding), tone: totalOutstanding > 0 ? "danger" : undefined },
        ]}
      />

      {actionError && <ErrorState message={actionError} />}

      <Card title="Fines">
        <Table
          caption="Fines"
          columns={["Patron", "Type", "Description", "Date", "Amount", "Outstanding", "Status", { label: "Actions", hideLabel: true }]}
          loading={loading}
          error={error}
          onRetry={reload}
          isEmpty={fines.length === 0}
          empty={{ title: "No fines on record", body: showPaid ? "Nothing has been charged yet." : "Nothing outstanding. Tick “Show settled” to see paid fines." }}
        >
          {fines.map((f) => (
            <tr key={f.id}>
              <td>{members.find((m) => m.id === f.memberId)?.name ?? "Unknown patron"}</td>
              <td><Badge tone="info">{statusLabel(f.type)}</Badge></td>
              <td>{f.description ?? "—"}</td>
              <td>{formatDate(f.createdAt)}</td>
              <td>{peso(f.amount)}</td>
              <td className="font-semibold">{peso(f.amountOutstanding)}</td>
              <td><FineStatus fine={f} /></td>
              <td>
                {!f.paidAt && (
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="primary" busy={busyId === f.id} busyLabel="Saving…" onClick={() => settle(f.id, "pay", f.amountOutstanding)}>
                      Mark paid
                    </Button>
                    <Button disabled={busyId === f.id} onClick={() => settle(f.id, "forgive")}>
                      Waive
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
