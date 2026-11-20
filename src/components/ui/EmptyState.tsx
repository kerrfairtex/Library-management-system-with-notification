import type { ReactNode } from "react";

/** What to show when a list has nothing in it: say so, and offer the next step. */
export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--line-strong)] px-5 py-8 text-center">
      <p className="display text-lg">{title}</p>
      {body && <p className="text-muted mx-auto mt-1 max-w-md text-sm">{body}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
