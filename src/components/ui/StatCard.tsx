import type { ReactNode } from "react";

export type Kpi = { label: string; value: ReactNode; hint?: string; tone?: "danger" | "warn" | "ok" };

/** The one stat-card style used site-wide (dashboards, My loans, Fines, Reports, Insights). */
export function StatCard({ item, index = 0 }: { item: Kpi; index?: number }) {
  return (
    <article className={`panel min-w-0 p-4 md:p-5 fade-up fade-up-delay-${Math.min(index, 3)}`}>
      <p className="eyebrow">{item.label}</p>
      <p
        className={`display mt-2 break-words text-2xl leading-tight sm:text-3xl md:text-4xl ${
          item.tone === "danger" ? "text-[var(--danger)]" : item.tone === "warn" ? "text-[var(--warn)]" : ""
        }`}
      >
        {item.value}
      </p>
      {item.hint && <p className="text-muted mt-1 text-xs md:text-sm">{item.hint}</p>}
    </article>
  );
}

function StatSkeleton() {
  return (
    <div className="panel p-4 md:p-5">
      <div className="skeleton h-3 w-20" />
      <div className="skeleton mt-3 h-8 w-14" />
      <div className="skeleton mt-2 h-3 w-24" />
    </div>
  );
}

/** Any number of stat cards: 2 per row on phones, `wide` per row from 1024px. */
export function StatGrid({ items, wide = 4, loading }: { items: Kpi[]; wide?: 2 | 3 | 4; loading?: boolean }) {
  const cols = wide === 2 ? "lg:grid-cols-2" : wide === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return (
    <section className={`grid grid-cols-2 gap-3 ${cols}`} aria-busy={loading || undefined}>
      {items.map((item, i) => (loading ? <StatSkeleton key={item.label} /> : <StatCard key={item.label} item={item} index={i} />))}
    </section>
  );
}

/**
 * Up to four headline figures. `layout="square"` keeps a 2×2 grid at every
 * width; the default spreads to one row of four from 1024px.
 */
export function KpiRow({ items, loading, layout = "row" }: { items: Kpi[]; loading?: boolean; layout?: "row" | "square" }) {
  const cols = layout === "square" ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4";
  if (loading) {
    return (
      <section className={`grid gap-3 ${cols}`} aria-busy="true" aria-label="Loading figures">
        {[0, 1, 2, 3].map((i) => (
          <StatSkeleton key={i} />
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
