import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function buttonClass(variant: ButtonVariant = "secondary", className = "") {
  return `btn btn-${variant}${className ? ` ${className}` : ""}`;
}

/**
 * The one button style. Every variant meets the 44px touch target and uses
 * the global focus ring. `busy` disables the button and announces the work.
 */
export function Button({
  variant = "secondary",
  busy = false,
  busyLabel,
  className = "",
  type = "button",
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  busy?: boolean;
  busyLabel?: string;
}) {
  return (
    <button
      type={type}
      className={buttonClass(variant, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

/** A link that looks like a Button (in-app navigation). */
export function ButtonLink({
  variant = "secondary",
  className = "",
  ...rest
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={buttonClass(variant, className)} {...rest} />;
}

/** A plain anchor styled as a Button (external links, downloads). */
export function ButtonAnchor({
  variant = "secondary",
  className = "",
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant }) {
  // Content arrives as children inside `rest`.
  // eslint-disable-next-line jsx-a11y/anchor-has-content
  return <a className={buttonClass(variant, className)} {...rest} />;
}
