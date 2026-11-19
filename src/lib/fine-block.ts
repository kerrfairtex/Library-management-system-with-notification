/**
 * Koha-style checkout block on unpaid fines (Koha: "noissuescharge";
 * Evergreen: patron fine threshold). Opt-in per deployment through
 * FINE_BLOCK_THRESHOLD (PHP). Unset, empty, non-numeric or <= 0 disables it,
 * so existing deployments keep their current behaviour.
 */
export function parseFineThreshold(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Returns the refusal message, or null when the checkout may proceed. */
export function fineBlockMessage(outstanding: number, threshold: number | null): string | null {
  if (threshold === null || !(outstanding >= threshold)) return null;
  return (
    `Checkout blocked: member owes ₱${outstanding.toFixed(2)} in unpaid fines ` +
    `(limit ₱${threshold.toFixed(2)}). Settle fines at the desk first.`
  );
}
