"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Browser-only Supabase client used exclusively for the Google OAuth handshake.
 *
 * Uses @supabase/ssr's createBrowserClient, which stores the PKCE code verifier
 * in COOKIES instead of localStorage. This fixes "PKCE code verifier not found"
 * errors caused by:
 *  - storage-key mismatches across deployments (env/key rotations)
 *  - the flow starting in one tab and finishing in another
 *  - Safari/iOS purging localStorage between redirect hops
 *
 * Returns null when public Supabase env vars aren't configured so the UI can
 * degrade gracefully instead of throwing during render.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Accept either the legacy `anon` JWT key or the new `sb_publishable_...` key.
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  client = createBrowserClient(supabaseUrl, supabaseAnonKey);
  return client;
}
