"use client";

/*
 * Building blocks shared by every role dashboard. Built only from the app's
 * existing classes (panel, badge, btn, table-wrap, tone-*) plus .skeleton.
 *
 * Layout contract: Greeting → KpiRow (max 4) → main panels → QuickActions.
 * The one deliberate flourish is DueStamp: due dates drawn like the rubber
 * date-due stamp on a library card, so "when is it due" reads at a glance.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { roleLabel } from "@/lib/permissions";
import type { UserRole } from "@/lib/types";
import { ErrorState } from "@/components/ui";

const muted = "text-muted";

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function Greeting({ name, role, subtitle }: { name: string; role: UserRole; subtitle: string }) {
  const first = name.trim().split(/\s+/)[0] || name;
  return (
    <header className="mb-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="display text-3xl md:text-4xl">
          {greetingFor(new Date().getHours())}, {first}
        </h1>
        <span className={`badge ${role === "admin" ? "tone-info" : role === "librarian" ? "tone-warn" : "tone-ok"}`}>
          {roleLabel(role)}
        </span>
      </div>
      <p className={`mt-1 max-w-2xl text-sm ${muted}`}>{subtitle}</p>
    </header>
  );
}

export { KpiRow, StatCard, StatGrid, type Kpi } from "@/components/ui";

/**
 * A main dashboard panel. Pass `loading`/`error` to get the skeleton or
 * error banner; `empty` replaces children with an inline empty state.
 */
export function Panel({
  title,
  href,
  linkLabel,
  loading,
  error,
  empty,
  children,
  className = "",
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  loading?: boolean;
  error?: string | null;
  empty?: { title: string; body: string; action?: ReactNode } | null;
  children?: ReactNode;
  className?: string;
}) {
  return (
    // min-w-0 lets a grid column shrink instead of being pushed wider by a table.
    <article className={`panel min-w-0 p-4 md:p-5 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="display text-xl md:text-2xl">{title}</h2>
        {href && linkLabel && (
          <Link href={href} className="shrink-0 text-sm font-semibold text-[var(--jade)]">
            {linkLabel}
          </Link>
        )}
      </div>
      {error ? (
        <ErrorState message={error} />
      ) : loading ? (
        <div className="space-y-2" aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-12 w-full" />
          ))}
        </div>
      ) : empty ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] px-4 py-6 text-center">
          <p className="font-semibold">{empty.title}</p>
          <p className={`mt-1 text-sm ${muted}`}>{empty.body}</p>
          {empty.action && <div className="mt-3">{empty.action}</div>}
        </div>
      ) : (
        children
      )}
    </article>
  );
}

export function QuickActions({ actions }: { actions: { href: string; label: string; primary?: boolean }[] }) {
  return (
    <section className="panel p-4 md:p-5">
      <h2 className="display mb-3 text-xl">Quick actions</h2>
      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        {actions.map((a) => (
          <Link key={a.href + a.label} href={a.href} className={`btn ${a.primary ? "btn-primary" : "btn-ghost"}`}>
            {a.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Date-due stamp: month over day, inked in the loan's status color. */
export function DueStamp({ dueAt, tone }: { dueAt: string; tone: "danger" | "warn" | "ok" }) {
  const d = new Date(dueAt);
  const color =
    tone === "danger" ? "var(--danger)" : tone === "warn" ? "var(--warn)" : "var(--jade)";
  return (
    <div
      className="due-stamp flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg"
      style={{ color, borderColor: color }}
      aria-hidden="true"
    >
      <span className="text-[0.6rem] font-bold uppercase tracking-[0.14em]">
        {d.toLocaleDateString(undefined, { month: "short" })}
      </span>
      <span className="display text-2xl leading-none">{d.getDate()}</span>
    </div>
  );
}
