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
import { ErrorBanner } from "@/components/ui";

const muted = "text-[color-mix(in_srgb,var(--ink)_60%,transparent)]";

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

export type Kpi = { label: string; value: ReactNode; hint?: string; tone?: "danger" | "warn" | "ok" };

/** The one stat-card style used site-wide (dashboards, My loans, Reports, Insights). */
export function StatCard({ item, index = 0 }: { item: Kpi; index?: number }) {
  return (
    <article className={`panel p-4 md:p-5 fade-up fade-up-delay-${Math.min(index, 3)}`}>
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[color-mix(in_srgb,var(--ink)_50%,transparent)]">
        {item.label}
      </p>
      <p
        className={`display mt-2 text-3xl md:text-4xl ${
          item.tone === "danger" ? "text-[var(--danger)]" : item.tone === "warn" ? "text-[var(--warn)]" : ""
        }`}
      >
        {item.value}
      </p>
      {item.hint && <p className={`mt-1 text-xs md:text-sm ${muted}`}>{item.hint}</p>}
    </article>
  );
}

/** Any number of stat cards: 2 per row on phones, `wide` per row from 1024px. */
export function StatGrid({ items, wide = 4 }: { items: Kpi[]; wide?: 2 | 3 | 4 }) {
  const cols = wide === 2 ? "lg:grid-cols-2" : wide === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return (
    <section className={`grid grid-cols-2 gap-3 ${cols}`}>
      {items.map((item, i) => (
        <StatCard key={item.label} item={item} index={i} />
      ))}
    </section>
  );
}

/**
 * Up to four headline figures. `layout="square"` keeps a 2×2 grid at every
 * width (My loans); the default spreads to one row of four from 1024px.
 */
export function KpiRow({ items, loading, layout = "row" }: { items: Kpi[]; loading?: boolean; layout?: "row" | "square" }) {
  const cols = layout === "square" ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4";
  if (loading) {
    return (
      <section className={`grid gap-3 ${cols}`} aria-busy="true" aria-label="Loading figures">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="panel p-4 md:p-5">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton mt-3 h-8 w-14" />
            <div className="skeleton mt-2 h-3 w-24" />
          </div>
        ))}
      </section>
    );
  }
  return (
    <section className={`grid gap-3 ${cols}`}>
      {items.slice(0, 4).map((item, i) => (
        <StatCard key={item.label} item={item} index={i} />
      ))}
    </section>
  );
}

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
        <ErrorBanner message={error} />
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
