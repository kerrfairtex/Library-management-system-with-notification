"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Browser-only Supabase client used exclusively for the Google OAuth handshake.
 * Returns null when public Supabase env vars aren't configured so the UI can
 * degrade gracefully instead of throwing during render.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Supabase is migrating from legacy JWT `anon` keys to the new
  // `sb_publishable_...` publishable keys. Both work identically for
  // browser use, so accept either env var name. See:
  // https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}
