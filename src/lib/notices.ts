/**
 * Notice rules shared by the in-app inbox and the e-mail sender:
 * where each notice should take the reader, and whether a notice is still
 * true at the moment it would be e-mailed (Evergreen's "validator": a book
 * returned since the overdue notice was queued must not get an overdue
 * e-mail). Pure, so it is tested directly.
 */

export type NoticeAudience = "member" | "staff";

export type NoticeLink = { href: string; label: string };

/** Where the reader can act on a notice. null when there is nothing to do. */
export function noticeLink(type: string, audience: NoticeAudience | null | undefined): NoticeLink | null {
  const member = audience !== "staff";
  switch (type) {
    case "due_soon":
      return member
        ? { href: "/my-loans#checkouts", label: "Renew or view your loans" }
        : { href: "/circulation/checkin", label: "Open check-in" };
    case "overdue":
      return member
        ? { href: "/my-loans#checkouts", label: "View your loans" }
        : { href: "/circulation/checkin", label: "Open check-in" };
    case "renewed":
    case "checked_out":
    case "returned":
      return member ? { href: "/my-loans#checkouts", label: "View your loans" } : null;
    case "hold_ready":
    case "hold_expiring":
    case "hold_expired":
      return member
        ? { href: "/my-loans#holds", label: "View your holds" }
        : { href: "/holds", label: "Open the holds queue" };
    case "borrow_request_submitted":
      return member ? { href: "/my-loans#requests", label: "View your requests" } : { href: "/holds", label: "Review requests" };
    case "borrow_request_approved":
    case "borrow_request_rejected":
      return { href: "/my-loans#requests", label: "View your requests" };
    case "pending_approval":
      return member ? null : { href: "/staff", label: "Review accounts" };
    default:
      return null;
  }
}

/** Joins a site URL and a path from noticeLink. */
export function absoluteLink(siteUrl: string | null, href: string): string | null {
  return siteUrl ? `${siteUrl.replace(/\/$/, "")}${href}` : null;
}

export type LoanState = { returned: boolean; dueAt: string } | null;
export type HoldState = { ready: boolean } | null;

/**
 * Is this notice still true right now? Unknown types are assumed true.
 * - due_soon: the loan is still out and not yet past due.
 * - overdue:  the loan is still out.
 * - hold_ready / hold_expiring: the member's hold is still waiting on the shelf.
 */
export function noticeStillTrue(
  type: string,
  state: { loan?: LoanState; hold?: HoldState },
  now = new Date()
): boolean {
  switch (type) {
    case "due_soon": {
      const loan = state.loan;
      return !!loan && !loan.returned && new Date(loan.dueAt).getTime() > now.getTime();
    }
    case "overdue":
      return !!state.loan && !state.loan.returned;
    case "hold_ready":
    case "hold_expiring":
      return !!state.hold && state.hold.ready;
    default:
      return true;
  }
}

/** Types whose related_id is a loan id. */
export const LOAN_NOTICE_TYPES = new Set(["due_soon", "overdue"]);
/** Types whose related_id is a book id, paired with the recipient's hold. */
export const HOLD_NOTICE_TYPES = new Set(["hold_ready", "hold_expiring"]);

export function holdExpiringMessage(title: string, expiresAt: string): string {
  const when = new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(expiresAt));
  return `"${title}" is still waiting for you at the library desk. Pick it up by ${when}, or it goes to the next member in line.`;
}
