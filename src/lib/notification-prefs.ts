/**
 * Per-patron notification e-mail settings (members.notification_prefs,
 * supabase/migrations/20261126_notification_prefs.sql).
 *
 * Every notice always appears in the in-app inbox. A patron chooses which
 * types are ALSO e-mailed. Overdue notices stay on for everyone: the library
 * must be able to reach a borrower about a late book (Koha and Evergreen
 * treat overdue notices the same way). Pure, so it is tested directly.
 */

export type PrefOption = {
  type: string;
  label: string;
  description: string;
  /** Cannot be turned off. */
  required?: boolean;
};

export const EMAIL_PREF_OPTIONS: readonly PrefOption[] = [
  { type: "due_soon", label: "Due-date reminders", description: "A few days before a book is due." },
  {
    type: "overdue",
    label: "Overdue notices",
    description: "When a book is past its due date. Always sent so the library can reach you.",
    required: true,
  },
  { type: "hold_ready", label: "Hold ready", description: "When a book you placed a hold on is waiting for you." },
  { type: "hold_expiring", label: "Pickup reminders", description: "The day before a ready hold's pickup window ends." },
  { type: "hold_expired", label: "Hold expired", description: "When a ready hold wasn't picked up in time." },
  {
    type: "borrow_request_approved",
    label: "Borrow request approved",
    description: "When the library approves a request to borrow.",
  },
  {
    type: "borrow_request_rejected",
    label: "Borrow request declined",
    description: "When the library can't approve a request.",
  },
];

const OPTIONAL = new Set(EMAIL_PREF_OPTIONS.filter((o) => !o.required).map((o) => o.type));

export type NotificationPrefs = { emailOff: string[] };

/** Reads the stored JSON; anything unknown or malformed means "e-mail everything". */
export function parsePrefs(raw: unknown): NotificationPrefs {
  const list =
    raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray((raw as { email_off?: unknown }).email_off)
      ? ((raw as { email_off: unknown[] }).email_off)
      : [];
  return { emailOff: [...new Set(list.filter((t): t is string => typeof t === "string" && OPTIONAL.has(t)))].sort() };
}

/** What is written to members.notification_prefs. */
export function serializePrefs(prefs: NotificationPrefs): { email_off: string[] } {
  return { email_off: parsePrefs({ email_off: prefs.emailOff }).emailOff };
}

/**
 * Validates a settings change from the browser: { email: { due_soon: false } }.
 * Returns the new prefs, or an error for the patron.
 */
export function applyPrefsUpdate(
  current: NotificationPrefs,
  body: unknown
): { ok: true; prefs: NotificationPrefs } | { ok: false; error: string } {
  const email = body && typeof body === "object" ? (body as { email?: unknown }).email : undefined;
  if (!email || typeof email !== "object" || Array.isArray(email)) {
    return { ok: false, error: "Send the e-mail settings to change." };
  }
  const off = new Set(current.emailOff);
  for (const [type, on] of Object.entries(email)) {
    const option = EMAIL_PREF_OPTIONS.find((o) => o.type === type);
    if (!option) return { ok: false, error: `Unknown notice type "${type}".` };
    if (typeof on !== "boolean") return { ok: false, error: `${option.label} must be on or off.` };
    if (option.required) {
      if (!on) return { ok: false, error: `${option.label} can't be turned off.` };
      continue;
    }
    if (on) off.delete(type);
    else off.add(type);
  }
  return { ok: true, prefs: { emailOff: [...off].sort() } };
}

/** Should this notice type be e-mailed to a member with these prefs? */
export function wantsEmail(prefs: NotificationPrefs, type: string): boolean {
  return !prefs.emailOff.includes(type);
}
