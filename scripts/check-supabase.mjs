#!/usr/bin/env node
/**
 * Verifies all five TRAC tables are reachable via the Supabase REST API.
 * Reads SUPABASE_URL and SUPABASE_SECRET_KEY from the environment.
 */
import { createClient } from "@supabase/supabase-js";
import "./_polyfill.mjs";

const url = process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

async function checkTable(table) {
  const { data, error } = await supabase
    .schema("public")
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) {
    console.error(`  ${table}: ERROR - ${error.message}`);
    return false;
  }
  console.log(`  ${table}: OK (${data === null ? 'count check' : 'reachable'})`);
  return true;
}

async function main() {
  const tables = ["users", "books", "members", "loans", "notifications"];
  const results = {};
  console.log("Checking Supabase table reachability...\n");
  for (const table of tables) {
    results[table] = await checkTable(table);
  }

  console.log("\n");
  const failedTables = tables.filter((table) => !results[table]);

  if (failedTables.length > 0) {
    console.log(`Some tables are not reachable. Failed: ${failedTables.join(", ")}`);
    console.log("Fix the items above, then re-run this script.");
    process.exit(1);
  } else {
    console.log("All tables are reachable. You can proceed with the setup!");
    console.log("\nDemo credentials are ready to use:");
    console.log("  Student:   student@gmail.com / student123");
    console.log("  Librarian: librarian@gmail.com / librarian123");
    console.log("  Admin:     admin@gmail.com / admin123");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});
