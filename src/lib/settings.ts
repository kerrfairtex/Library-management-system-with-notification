import { db, supabase } from "./supabase";
import { resolveCirculationSettings, CIRCULATION_DEFAULTS, type CirculationSettings } from "./circulation-settings";

export {
  CIRCULATION_DEFAULTS,
  parseCirculationSetting,
  resolveCirculationSettings,
  type CirculationSettings,
} from "./circulation-settings";

const CACHE_TTL_MS = 60 * 1000;
let cache: { value: CirculationSettings; expires: number } | null = null;

export async function getCirculationSettings(): Promise<CirculationSettings> {
  if (cache && cache.expires > Date.now()) return cache.value;
  const { data, error } = await db(supabase)
    .from("settings")
    .select("key, value")
    .like("key", "circulation.%");
  if (error) {
    // A settings outage must not stop circulation: use the defaults, and do
    // not cache them so the next call retries.
    console.error("Could not load circulation settings, using defaults:", error.message);
    return { ...CIRCULATION_DEFAULTS };
  }
  const value = resolveCirculationSettings((data ?? []) as { key: string; value: unknown }[]);
  cache = { value, expires: Date.now() + CACHE_TTL_MS };
  return value;
}

export function invalidateCirculationSettings(): void {
  cache = null;
}
