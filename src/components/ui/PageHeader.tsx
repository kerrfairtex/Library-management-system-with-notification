import type { ReactNode } from "react";

/** The page's <h1>, a one-line description, and its main actions. */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="display text-3xl md:text-4xl">{title}</h1>
        {subtitle && <p className="text-muted mt-1 max-w-2xl text-sm">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}
