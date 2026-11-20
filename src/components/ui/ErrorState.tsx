import type { ReactNode } from "react";
import { Button } from "./Button";

/**
 * A failed load or action: what went wrong, and a retry when one helps.
 * Announced to screen readers (role="alert").
 */
export function ErrorState({
  message,
  title,
  onRetry,
  className = "",
}: {
  message: ReactNode;
  title?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={`notice tone-danger mb-4 flex flex-wrap items-center justify-between gap-3 ${className}`.trim()}>
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <p>{message}</p>
      </div>
      {onRetry && (
        <Button variant="ghost" onClick={onRetry} className="bg-white/70">
          Try again
        </Button>
      )}
    </div>
  );
}

/** A short result message (saved, checked out, …). Success is polite; errors interrupt. */
export function Notice({
  tone = "ok",
  children,
  className = "",
}: {
  tone?: "ok" | "info" | "warn" | "danger";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`notice tone-${tone} mb-4 ${className}`.trim()}>
      {children}
    </div>
  );
}
