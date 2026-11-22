/**
 * Patron self-renewal (My loans → Renew). The database is the authority:
 * renew_loan() refuses a loan at its renewal limit or one another member is
 * waiting for (supabase/migrations/20261123_circulation_rules_enforced.sql).
 * This module mirrors those rules so the page can say up front whether a
 * loan can be renewed and why not, and turns a database refusal into a
 * sentence for the patron. Pure, so it is tested directly.
 */

/** Used when the member type has no circulation rule (Koha's defaults). */
export const DEFAULT_RENEWAL_RULE = { renewalDays: 7, maxRenewals: 2 } as const;

export type RenewalRule = { renewalDays: number; maxRenewals: number };

export type RenewalCheck =
  | { canRenew: true; renewalsLeft: number; extraDays: number; reason: null }
  | { canRenew: false; renewalsLeft: number; extraDays: number; reason: string };

export function renewalCheck(input: {
  returned: boolean;
  renewalsCount: number;
  rule: RenewalRule;
  /** Pending holds by OTHER members on this title. */
  waitingHolds: number;
  /** Copies of the title on the shelf right now. */
  availableCopies: number;
  /** Library-wide cap from settings (max_renewal_days). */
  maxRenewalDays: number;
  /** Message from the fine block, or null when fines don't block. */
  fineBlock: string | null;
}): RenewalCheck {
  const max = Math.max(0, input.rule.maxRenewals);
  const used = Math.max(0, input.renewalsCount);
  const renewalsLeft = Math.max(0, max - used);
  const extraDays = Math.max(1, Math.min(input.rule.renewalDays, input.maxRenewalDays));
  const no = (reason: string): RenewalCheck => ({ canRenew: false, renewalsLeft, extraDays, reason });

  if (input.returned) return no("This book has been returned.");
  if (renewalsLeft === 0) {
    return no(
      max === 0
        ? "Loans for your member type can't be renewed."
        : `Renewal limit reached (${max} of ${max} used). Please return it by the due date.`
    );
  }
  if (input.waitingHolds > 0 && input.availableCopies <= 0) {
    return no("Another member is waiting for this title. Please return it by the due date.");
  }
  if (input.fineBlock) return no(input.fineBlock);
  return { canRenew: true, renewalsLeft, extraDays, reason: null };
}

export function renewalFineBlock(outstanding: number, threshold: number | null): string | null {
  if (threshold === null || !(outstanding >= threshold)) return null;
  return (
    `Renewal blocked: you owe ₱${outstanding.toFixed(2)} in unpaid fines ` +
    `(limit ₱${threshold.toFixed(2)}). Settle fines at the library desk first.`
  );
}

/**
 * renew_loan() raises plain exceptions. Its own messages are already written
 * for people; anything else (a connection error, a bug) gets a safe generic
 * sentence instead of database text.
 */
const KNOWN_REFUSALS = [
  /^Renewal limit reached/,
  /^Cannot renew: another member is waiting/,
  /^Cannot renew a returned loan/,
  /^Member is inactive/,
];

export function renewalErrorForPatron(message: string | null | undefined): string {
  const text = (message ?? "").trim();
  if (KNOWN_REFUSALS.some((re) => re.test(text))) {
    if (text.startsWith("Member is inactive")) {
      return "Your library membership is inactive. Please contact the library desk.";
    }
    return text;
  }
  return "The loan wasn't renewed. Please try again, or ask at the library desk.";
}
