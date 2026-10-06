import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// All tables live in the `public` schema on the project.
// Supabase cluster (public belongs to another app). db.table(...) prefixes
// every query; RPC calls use the schema-qualified function name.
const SCHEMA = "public";

function db(supabaseClient: SupabaseClient) {
  return supabaseClient.schema(SCHEMA);
}

export { db };

let client: SupabaseClient | null = null;

function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY environment variables."
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
