"use client";

import { Children, useLayoutEffect, useRef, type ReactNode } from "react";
import { ErrorState } from "./ErrorState";
import { EmptyState } from "./EmptyState";

export type Column = string | { label: string; hideLabel?: boolean; className?: string };

const labelOf = (c: Column) => (typeof c === "string" ? c : c.label);

/**
 * The one data table. From 768px it is a normal table; below that every row
 * becomes a card whose values are labelled with their column name (the CSS
 * reads td[data-label], which this component fills in from `columns`).
 *
 * States replace the rows: `error` (with retry), `loading` (skeleton rows),
 * then `empty` when `isEmpty` — so an empty message never shows mid-load.
 */
export function Table({
  columns,
  caption,
  children,
  loading = false,
  error,
  onRetry,
  isEmpty,
  empty,
  compact = false,
  className = "",
}: {
  columns: Column[];
  /** Accessible name for the table; visually hidden. */
  caption: string;
  children?: ReactNode;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  isEmpty?: boolean;
  empty?: { title: string; body?: ReactNode; action?: ReactNode };
  compact?: boolean;
  className?: string;
}) {
  const body = useRef<HTMLTableSectionElement>(null);
  const labels = columns.map((c) => (typeof c !== "string" && c.hideLabel ? "" : labelOf(c)));
  const labelKey = labels.join("|");

  // Label each cell for the mobile card layout; re-run when rows change.
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const names = labelKey.split("|");
    const apply = () => {
      // Direct rows only: a nested Table labels its own cells.
      Array.from(el.children).forEach((tr) => {
        Array.from(tr.children).forEach((cell, i) => {
          if (cell.hasAttribute("colspan")) return;
          const text = names[i] ?? "";
          if (cell.getAttribute("data-label") !== text) cell.setAttribute("data-label", text);
        });
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [labelKey]);

  const span = columns.length;
  const hasRows = Children.count(children) > 0;
  let state: ReactNode = null;
  if (error) {
    state = <ErrorState message={error} onRetry={onRetry} className="mb-0" />;
  } else if (loading && !hasRows) {
    state = (
      <div className="space-y-2 py-1" aria-busy="true" aria-label={`Loading ${caption.toLowerCase()}`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-10 w-full" />
        ))}
      </div>
    );
  } else if (isEmpty && empty) {
    state = <EmptyState {...empty} />;
  }

  return (
    <div className={`table-wrap ${className}`.trim()}>
      <table className={`data-table${compact ? " data-table-compact" : ""}`} data-managed="">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} scope="col" className={typeof c === "string" ? undefined : c.className}>
                {typeof c !== "string" && c.hideLabel ? <span className="sr-only">{c.label}</span> : labelOf(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={body}>
          {state ? (
            <tr>
              <td colSpan={span} className="table-state">
                {state}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}
