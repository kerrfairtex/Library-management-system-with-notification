"use client";

/*
 * Circulation home — lookalike of Koha's circ/circulation-home.tt:
 * three cards — big action buttons, holds queue, overdues/reports.
 */

import Link from "next/link";
import { useApi } from "@/lib/hooks";
import type { Loan } from "@/lib/types";
import { deriveLoanStatus } from "@/lib/loan-status";

type LoanDto = Loan & { status: string; dueAt?: string; due_at?: string };

export default function CirculationHomePage() {
  const { data: loansPage, loading } = useApi<{ data: LoanDto[] }>("/api/loans?pageSize=1000");
  const loans = loansPage?.data ?? [];
  const open = loans.filter((l) => l.status !== "returned");
  const overdue = open.filter(
    (l) => deriveLoanStatus({ status: l.status, due_at: l.dueAt }) === "overdue"
  );

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Circulation</h1>
      </div>

      <div className="circ-grid">
        {/* Col A: actions — mirrors Koha circulation-actions */}
        <section className="circ-card">
          <h3>Circulation</h3>
          <div className="circ-buttons">
            <Link href="/circulation/checkout" className="circ-button">
              <span aria-hidden>⬆</span> Check out
            </Link>
            <Link href="/circulation/checkin" className="circ-button alt">
              <span aria-hidden>⬇</span> Check in
            </Link>
            <Link href="/loans?filter=renew" className="circ-button warn">
              <span aria-hidden>↻</span> Renew
            </Link>
            <Link href="/books/new" className="circ-button">
              <span aria-hidden>✚</span> Fast cataloging
            </Link>
          </div>
        </section>

        {/* Col B: holds */}
        <section className="circ-card">
          <h3>Holds</h3>
          <ul className="circ-links">
            <li>
              <Link href="/loans">
                Holds queue <span className="circ-count">{loading ? "…" : open.length}</span>
              </Link>
            </li>
            <li>
              <Link href="/loans?filter=active">
                Active loans <span className="circ-count">{open.length}</span>
              </Link>
            </li>
            <li>
              <Link href="/holds">Holds queue</Link>
            </li>
            <li>
              <Link href="/fines">Fines desk</Link>
            </li>
            <li>
              <Link href="/members">Patron search</Link>
            </li>
          </ul>
        </section>

        {/* Col C: overdues + reports */}
        <section className="circ-card">
          <h3>Overdues &amp; reports</h3>
          <ul className="circ-links">
            <li>
              <Link href="/loans?filter=overdue">
                Overdues{" "}
                <span className="circ-count" style={{ color: "#8c1d1d" }}>
                  {overdue.length}
                </span>
              </Link>
            </li>
            <li>
              <Link href="/reports">Reports home</Link>
            </li>
            <li>
              <Link href="/notifications">Notifications</Link>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
