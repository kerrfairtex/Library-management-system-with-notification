import { useId, type ReactNode } from "react";

/**
 * The one card surface (`.panel`). With a `title`, the card is a labelled
 * region with an <h2> heading and an optional action on the right.
 */
export function Card({
  title,
  action,
  children,
  className = "",
  padded = true,
  as: Tag = "section",
  anchorId,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  padded?: boolean;
  as?: "section" | "article" | "div";
  /** Optional fragment target, e.g. "holds" for /my-loans#holds. */
  anchorId?: string;
}) {
  const id = useId();
  return (
    <Tag
      id={anchorId}
      className={`panel min-w-0 ${anchorId ? "scroll-mt-20" : ""} ${padded ? "p-4 md:p-5" : ""} ${className}`.trim()}
      aria-labelledby={title ? id : undefined}
    >
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {title && (
            <h2 id={id} className="display text-xl md:text-2xl">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </Tag>
  );
}
