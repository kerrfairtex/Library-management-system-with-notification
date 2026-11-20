"use client";

/*
 * Building blocks shared by every role dashboard, built from the shared
 * UI kit (src/components/ui).
 *
 * Layout contract: Greeting → KpiRow (max 4) → main panels → QuickActions.
 * The one deliberate flourish is DueStamp: due dates drawn like the rubber
 * date-due stamp on a library card, so "when is it due" reads at a glance.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { roleLabel } from "@/lib/permissions";
import type { UserRole } from "@/lib/types";
import { Badge, ButtonLink, Card, EmptyState, ErrorState } from "@/components/ui";

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
        <Badge tone={role === "admin" ? "info" : role === "librarian" ? "warn" : "ok"}>{roleLabel(role)}</Badge>
      </div>
      <p className="text-muted mt-1 max-w-2xl text-sm">{subtitle}</p>
    </header>
  );
}

export { KpiRow, StatCard, StatGrid, type Kpi } from "@/components/ui";

/**
 * A main dashboard panel (a Card). Pass `loading`/`error` for the skeleton or
 * the error with retry; `empty` replaces children with an EmptyState.
 */
export function Panel({
  title,
  href,
  linkLabel,
  loading,
  error,
  onRetry,
  empty,
  children,
  className = "",
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: { title: string; body: string; action?: ReactNode } | null;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card
      as="article"
      title={title}
      className={className}
      action={
        href && linkLabel ? (
          <Link href={href} className="link inline-flex min-h-[var(--tap)] shrink-0 items-center text-sm">
            {linkLabel}
          </Link>
        ) : undefined
      }
    >
      {error ? (
        <ErrorState message={error} onRetry={onRetry} className="mb-0" />
      ) : loading ? (
        <div className="space-y-2" aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-12 w-full" />
          ))}
        </div>
      ) : empty ? (
        <EmptyState title={empty.title} body={empty.body} action={empty.action} />
      ) : (
        children
      )}
    </Card>
  );
}

export function QuickActions({ actions }: { actions: { href: string; label: string; primary?: boolean }[] }) {
  return (
    <Card title="Quick actions">
      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        {actions.map((a) => (
          <ButtonLink key={a.href + a.label} href={a.href} variant={a.primary ? "primary" : "ghost"}>
            {a.label}
          </ButtonLink>
        ))}
      </div>
    </Card>
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
