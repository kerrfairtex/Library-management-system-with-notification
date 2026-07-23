"use client";

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[rgba(18,36,31,0.45)]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="panel relative z-10 w-full max-w-lg p-5 fade-up">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="display text-2xl">{title}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--line)] px-6 py-10 text-center">
      <p className="display text-xl">{title}</p>
      <p className="mt-2 text-sm text-[color-mix(in_srgb,var(--ink)_60%,transparent)]">{body}</p>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display text-3xl md:text-4xl">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-[color-mix(in_srgb,var(--ink)_65%,transparent)]">
          {subtitle}
        </p>
      </div>
      {action}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
      {message}
    </div>
  );
}
