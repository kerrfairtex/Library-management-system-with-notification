#!/usr/bin/env node
// Diagnoses common Supabase setup problems for TRAC, in particular the
// "Could not find the table 'public.<table>' in the schema cache" error.
//
// Usage:
//   node --env-file=.env.local scripts/check-supabase.mjs
//
// Prefers a server-side key (new SUPABASE_SECRET_KEY or legacy
// SUPABASE_SERVICE_ROLE_KEY) so it can check write access too. Falls back
// to a publishable/anon key (read-only check) if that's all you have —
// enough to confirm whether tables exist, since RLS is off by default
// in supabase/schema.sql.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const key = serviceRoleKey || publicKey;

if (!supabaseUrl || !key) {
  console.error(
    "Missing SUPABASE_URL and a key to check with (SUPABASE_SECRET_KEY, " +
      "SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY, or " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY).\n" +
      "Run this with your env file loaded, e.g.:\n" +
      "  node --env-file=.env.local scripts/check-supabase.mjs"
  );
  process.exit(1);
}

console.log(`Checking Supabase project: ${supabaseUrl}`);
console.log(
  serviceRoleKey
    ? "Using a server-side key.\n"
    : "Using a publishable/anon key (read-only check — set SUPABASE_SECRET_KEY for full access).\n"
);

const supabase = createClient(supabaseUrl, key);

const tables = ["users", "books", "members", "loans", "notifications"];
let hadFailure = false;

for (const table of tables) {
  const { data, error } = await supabase.from(table).select("id").limit(1);

  if (error) {
    hadFailure = true;
    const isSchemaCacheMiss =
      error.code === "PGRST205" || /schema cache/i.test(error.message ?? "");
    console.log(`✗ ${table.padEnd(14)} ${error.message}`);
    if (isSchemaCacheMiss) {
      console.log(
        `  → Run supabase/schema.sql against THIS project, then either wait a\n` +
          `    minute or run: select pg_notify('pgrst', 'reload schema');\n` +
          `    Also confirm "public" is under Settings → API → Exposed schemas.`
      );
    }
  } else {
    const rows = data?.length ?? 0;
    console.log(`✓ ${table.padEnd(14)} reachable (has ${rows ? "at least one row" : "no rows yet"})`);
  }
}

console.log("");
if (hadFailure) {
  console.log(
    "Some tables are not reachable. Fix the items above, then re-run this script."
  );
  process.exit(1);
} else {
  console.log("All tables are reachable. If login still fails, run `npm run seed:users`.");
}
