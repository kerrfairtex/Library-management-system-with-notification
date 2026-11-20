"use client";

/*
 * Circulation home: the desk's main actions, plus counts and shortcuts.
 */

import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, BookPlus, ChevronRight, RefreshCw } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { useDeskSession } from "@/components/DeskSessionProvider";
import type { Loan } from "@/lib/types";
import { deriveLoanStatus } from "@/lib/loan-status";
import { canAccess } from "@/lib/permissions";
import { ButtonLink, Card, EmptyState, ErrorState, PageHeader } from "@/components/ui";

// Force dynamic rendering - this page needs session and database access
export const dynamic = "force-dynamic";

type LoanDto = Loan & { status: string; dueAt?: string; due_at?: string };

function Shortcut({ href, label, count, danger }: { href: string; label: string; count?: number | string; danger?: boolean }) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-[var(--tap)] items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-[var(--mist)]"
      >
        <span>{label}</span>
        <span className="flex items-center gap-2">
          {count !== undefined && (
            <span className={`font-semibold ${danger ? "text-[var(--danger)]" : "text-[var(--jade-deep)]"}`}>{count}</span>
          )}
          <ChevronRight size={16} aria-hidden className="text-muted" />
        </span>
      </Link>
    </li>
  );
}

export default function CirculationHomePage() {
  const { session: me } = useDeskSession();
  const canManage = me?.user ? canAccess(me.user, "loans.manage") : false;
  const { data: loansPage, loading, error, reload } = useApi<{ data: LoanDto[] }>("/api/loans?pageSize=1000");
  const loans = loansPage?.data ?? [];
  const open = loans.filter((l) => l.status !== "returned");
  const overdue = open.filter(
    (l) => deriveLoanStatus({ status: l.status, due_at: l.dueAt }) === "overdue"
  );
  const count = (n: number) => (loading ? "…" : n);

  if (!canManage) {
    return (
      <div>
        <PageHeader title="Circulation" />
        <Card>
          <EmptyState title="Librarians and admins only" body="This page is only available to library staff." />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Circulation" subtitle="Check books out and in, renew loans, and add new titles." />

      {error && <ErrorState message={error} onRetry={reload} />}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Desk actions">
          <div className="grid gap-2">
            <ButtonLink href="/circulation/checkout" variant="primary" className="justify-start">
              <ArrowUpFromLine size={18} aria-hidden /> Check out
            </ButtonLink>
            <ButtonLink href="/circulation/checkin" variant="primary" className="justify-start">
              <ArrowDownToLine size={18} aria-hidden /> Check in
            </ButtonLink>
            <ButtonLink href="/loans?filter=renew" className="justify-start">
              <RefreshCw size={18} aria-hidden /> Renew
            </ButtonLink>
            <Link href="/books?add=1" className="btn btn-secondary justify-start">
              <BookPlus size={18} aria-hidden /> Fast cataloging
            </Link>
          </div>
        </Card>

        <Card title="Desk shortcuts">
          <ul className="space-y-1">
            <Shortcut href="/loans?filter=active" label="Active loans" count={count(open.length)} />
            <Shortcut href="/holds" label="Holds & requests" />
            <Shortcut href="/fines" label="Fines" />
            <Shortcut href="/members" label="Patrons" />
          </ul>
        </Card>

        <Card title="Overdue & reports">
          <ul className="space-y-1">
            <Shortcut href="/loans?filter=overdue" label="Overdue loans" count={count(overdue.length)} danger={overdue.length > 0} />
            <Shortcut href="/reports" label="Reports" />
            <Shortcut href="/notifications" label="Notifications" />
          </ul>
        </Card>
      </div>
    </div>
  );
}
