import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  // Supabase is migrating from legacy JWT `service_role` keys to the new
  // `sb_secret_...` secret keys. Both work identically server-side, so
  // accept either env var name. See:
  // https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
  const supabaseServiceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SECRET_KEY (or the legacy " +
        "SUPABASE_SERVICE_ROLE_KEY) environment variables."
    );
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

/** Lazily initialized so builds succeed without env vars present. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    if (!client) client = createSupabaseClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
