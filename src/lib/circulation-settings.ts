/**
 * Admin-editable circulation settings (public.settings, keys
 * "circulation.<name>", edited on /settings). Everything that applies one of
 * these values reads it from here, so a change on the settings page takes
 * effect within CACHE_TTL_MS on every server instance.
 *
 * Loan caps and fines per day are NOT here: they are per member type in
 * circulation_rules (enforced by the database), so the settings page no
 * longer offers library-wide copies of them.
 */
export type CirculationSettings = {
  /** Default loan length offered at checkout. */
  loan_period_days: number;
  /** Choices offered at checkout. */
  loan_period_options: number[];
  /** Longest loan staff may issue. */
  max_loan_days: number;
  /** Longest single renewal. */
  max_renewal_days: number;
  /** Days a "ready" hold waits on the hold shelf before it expires. */
  pickup_window_days: number;
  /** Days before the due date that a due-soon reminder goes out. */
  due_soon_window_days: number;
  /** Minimum days between two reminders for the same loan. */
  overdue_alert_cooldown_days: number;
};

export const CIRCULATION_DEFAULTS: CirculationSettings = {
  loan_period_days: 14,
  loan_period_options: [7, 14, 21, 30],
  max_loan_days: 60,
  max_renewal_days: 60,
  pickup_window_days: 3,
  due_soon_window_days: 3,
  overdue_alert_cooldown_days: 4,
};

/** Inclusive bounds for each numeric setting. */
const BOUNDS: Record<Exclude<keyof CirculationSettings, "loan_period_options">, [number, number]> = {
  loan_period_days: [1, 365],
  max_loan_days: [1, 365],
  max_renewal_days: [1, 365],
  pickup_window_days: [1, 30],
  due_soon_window_days: [1, 30],
  overdue_alert_cooldown_days: [1, 30],
};

function toInt(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) ? n : null;
}

function toIntList(value: unknown): number[] | null {
  let list = value;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list) || list.length === 0 || list.length > 12) return null;
  const ints = list.map(toInt);
  if (ints.some((n) => n === null || n < 1 || n > 365)) return null;
  return [...new Set(ints as number[])].sort((a, b) => a - b);
}

/**
 * Validates one setting. Returns the clean value, or an error message for
 * the admin. Unknown keys are rejected so the table only holds known keys.
 */
export function parseCirculationSetting(
  key: string,
  value: unknown
): { ok: true; key: keyof CirculationSettings; value: number | number[] } | { ok: false; error: string } {
  if (key === "loan_period_options") {
    const list = toIntList(value);
    return list
      ? { ok: true, key, value: list }
      : { ok: false, error: "Loan period options must be 1–12 whole numbers of days between 1 and 365." };
  }
  if (!(key in BOUNDS)) {
    return { ok: false, error: `Unknown setting "${key}".` };
  }
  const k = key as keyof typeof BOUNDS;
  const [min, max] = BOUNDS[k];
  const n = toInt(value);
  if (n === null || n < min || n > max) {
    return { ok: false, error: `${key} must be a whole number between ${min} and ${max}.` };
  }
  return { ok: true, key: k, value: n };
}

/** Builds settings from stored rows; bad or unknown values fall back to defaults. */
export function resolveCirculationSettings(
  rows: { key: string; value: unknown }[]
): CirculationSettings {
  const result: CirculationSettings = { ...CIRCULATION_DEFAULTS };
  for (const row of rows) {
    if (!row.key.startsWith("circulation.")) continue;
    const parsed = parseCirculationSetting(row.key.slice("circulation.".length), row.value);
    if (parsed.ok) (result as Record<string, unknown>)[parsed.key] = parsed.value;
  }
  return result;
}
