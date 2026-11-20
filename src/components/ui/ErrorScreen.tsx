import type { ReactNode } from "react";

/**
 * Full-page message for the 404 page and the error boundaries: what
 * happened, and where to go next. Works inside and outside the desk shell.
 */
export function ErrorScreen({
  eyebrow,
  title,
  body,
  actions,
  detail,
}: {
  eyebrow: string;
  title: string;
  body: ReactNode;
  actions: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-start gap-4 py-10 sm:py-16">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="display text-3xl sm:text-4xl">{title}</h1>
      <div className="text-muted text-base leading-relaxed">{body}</div>
      <div className="flex flex-wrap gap-2">{actions}</div>
      {detail && <p className="text-muted text-xs">{detail}</p>}
    </section>
  );
}
