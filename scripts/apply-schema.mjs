#!/usr/bin/env node
// Applies supabase/schema.sql directly to your Supabase project using the
// Management API — no need to open the SQL editor by hand.
//
// This needs a Personal Access Token (PAT), which is a DIFFERENT credential
// from your project's API keys (SUPABASE_URL / SUPABASE_SECRET_KEY). A PAT
// is account-level and lets you manage projects (run SQL, create branches,
// etc.) rather than read/write rows. Create one at:
//   https://supabase.com/dashboard/account/tokens
//
// Usage:
//   SUPABASE_PROJECT_REF=your-project-ref SUPABASE_ACCESS_TOKEN=sbp_xxx \
//     node scripts/apply-schema.mjs
//
// The project ref is the subdomain in your project URL, e.g. for
// https://cphkxgykshjeultzgzmz.supabase.co it's "cphkxgykshjeultzgzmz".

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRef = process.env.SUPABASE_PROJECT_REF;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!projectRef || !accessToken) {
  console.error(
    "Missing SUPABASE_PROJECT_REF or SUPABASE_ACCESS_TOKEN.\n\n" +
      "SUPABASE_ACCESS_TOKEN is a Personal Access Token (PAT) — different from\n" +
      "your project's SUPABASE_SECRET_KEY / anon key. Create one at:\n" +
      "  https://supabase.com/dashboard/account/tokens\n\n" +
      "SUPABASE_PROJECT_REF is the subdomain in your project URL, e.g. for\n" +
      "https://cphkxgykshjeultzgzmz.supabase.co it's cphkxgykshjeultzgzmz.\n\n" +
      "Then run:\n" +
      "  SUPABASE_PROJECT_REF=your-project-ref SUPABASE_ACCESS_TOKEN=sbp_xxx \\\n" +
      "    node scripts/apply-schema.mjs"
  );
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(scriptDir, "..", "supabase", "schema.sql");
const sql = readFileSync(schemaPath, "utf8");

console.log(`Applying supabase/schema.sql to project ${projectRef}...`);

const res = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  }
);

const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = text;
}

if (!res.ok) {
  console.error(`✗ Failed (HTTP ${res.status}):`);
  console.error(typeof body === "string" ? body : JSON.stringify(body, null, 2));
  if (res.status === 401 || res.status === 403) {
    console.error(
      "\nCheck that SUPABASE_ACCESS_TOKEN is a valid Personal Access Token " +
        "with access to this project, and that SUPABASE_PROJECT_REF is correct."
    );
  }
  process.exit(1);
}

console.log("✓ Schema applied successfully.");
console.log(
  "\nNext steps:\n" +
    "  npm run db:check     # confirm all tables are now reachable\n" +
    "  npm run seed:users   # create the demo librarian/admin accounts"
);
