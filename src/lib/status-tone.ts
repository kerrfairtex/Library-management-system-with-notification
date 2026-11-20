/**
 * One mapping from a record's status to a badge tone and a readable label,
 * so "pending" or "overdue" looks and reads the same on every page.
 * Pure (no React) so it is tested directly.
 */
export type Tone = "neutral" | "ok" | "warn" | "danger" | "info";

const TONES: Record<string, Tone> = {
  // loans
  active: "info",
  on_loan: "info",
  overdue: "danger",
  returned: "neutral",
  // holds and borrow requests
  pending: "warn",
  waiting: "warn",
  ready: "ok",
  approved: "ok",
  fulfilled: "neutral",
  cancelled: "neutral",
  canceled: "neutral",
  expired: "neutral",
  rejected: "danger",
  // copies
  available: "ok",
  in_transit: "info",
  not_for_loan: "warn",
  damaged: "neutral",
  lost: "danger",
  withdrawn: "neutral",
  // fines
  paid: "ok",
  outstanding: "warn",
  waived: "neutral",
};

export function statusTone(status: string | null | undefined): Tone {
  return TONES[(status ?? "").toLowerCase()] ?? "neutral";
}

const LABELS: Record<string, string> = {
  on_loan: "On loan",
  not_for_loan: "Not for loan",
  in_transit: "In transit",
  active: "On loan",
};

/** "not_for_loan" → "Not for loan", "pending" → "Pending". */
export function statusLabel(status: string | null | undefined): string {
  const key = (status ?? "").toLowerCase();
  if (!key) return "Unknown";
  if (LABELS[key]) return LABELS[key];
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
