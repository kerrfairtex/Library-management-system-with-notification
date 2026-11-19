#!/usr/bin/env node
/**
 * Pre-deploy schema check (READ-ONLY). Verifies that every table, column and
 * database function the current code depends on exists in the Supabase
 * project, and names the SQL file that creates anything missing.
 *
 *   npm run db:check            (reads .env.local)
 *
 * Exits 1 when something required is missing, so a deploy can be stopped
 * before shipping code the database cannot serve. Writes nothing and never
 * calls a database function.
 */
import { createClient } from "@supabase/supabase-js";
import "./_polyfill.mjs";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (e.g. in .env.local).");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const SCHEMA = "supabase/schema.sql";
const KOHA = "supabase/koha-upgrade.sql";
const ACADEMIC = "supabase/migrations/20261117_academic_user_management_up.sql";
const ADMIN = "supabase/migrations/20261118_admin_protection_atomic.sql";
const EMAIL = "supabase/migrations/20261119_notification_email.sql";
const COURSE_DEPT = "supabase/migrations/20261120_course_department.sql";
const ORDER = [SCHEMA, KOHA, ACADEMIC, ADMIN, EMAIL, COURSE_DEPT];

// [table, columns, file that creates them, required?]
const COLUMN_CHECKS = [
  ["users", "id,email,role,status", SCHEMA, true],
  ["books", "id,title,isbn,available_copies", SCHEMA, true],
  ["members", "id,email,member_type,student_id,user_id,active", SCHEMA, true],
  ["loans", "id,book_id,member_id,status", SCHEMA, true],
  ["notifications", "id,type,audience,recipient_member_id", SCHEMA, true],
  ["holds", "id,kind,status,expires_at", KOHA, true],
  ["fines", "id,member_id,amount_outstanding", KOHA, true],
  ["book_items", "id,book_id,barcode,status", KOHA, true],
  ["circulation_rules", "id,member_type,max_loans", KOHA, true],
  ["departments", "id,code,name,active", ACADEMIC, true],
  ["courses", "id,code,name,active", ACADEMIC, true],
  ["members", "department_id,course_id,year_level,section", ACADEMIC, true],
  ["courses", "department_id", COURSE_DEPT, true],
  ["notifications", "emailed_at", `${EMAIL} (only needed for e-mail notices)`, false],
];

const FUNCTION_CHECKS = [
  ["checkout_loan", SCHEMA],
  ["renew_loan", SCHEMA],
  ["return_loan", SCHEMA],
  ["sweep_loan_statuses", SCHEMA],
  ["count_incomplete_student_profiles", ACADEMIC],
  ["filtered_user_statistics", ACADEMIC],
  ["change_user_role", ADMIN],
  ["change_user_status", ADMIN],
  ["approve_student_account", ADMIN],
  ["delete_user_guarded", ADMIN],
];

async function checkColumns(table, columns) {
  const { error } = await supabase.from(table).select(columns).limit(1);
  return error ? `${error.code ?? ""} ${error.message}`.trim() : null;
}

/** Function names exposed by PostgREST, from its OpenAPI description. */
async function exposedFunctions() {
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" },
  });
  if (!res.ok) throw new Error(`Could not read the API description (HTTP ${res.status}).`);
  const spec = await res.json();
  return new Set(
    Object.keys(spec.paths ?? {})
      .filter((p) => p.startsWith("/rpc/"))
      .map((p) => p.slice(5))
  );
}

async function main() {
  console.log("TRAC database check (read-only)\n");
  const missing = new Set();
  for (const [table, columns, file, required] of COLUMN_CHECKS) {
    const problem = await checkColumns(table, columns);
    const tag = problem ? (required ? "MISSING " : "optional") : "ok      ";
    console.log(`  ${tag} ${table}(${columns})${problem ? `  → ${file}` : ""}`);
    if (problem && required) missing.add(file);
  }
  const functions = await exposedFunctions();
  for (const [name, file] of FUNCTION_CHECKS) {
    const ok = functions.has(name);
    console.log(`  ${ok ? "ok      " : "MISSING "} function ${name}()${ok ? "" : `  → ${file}`}`);
    if (!ok) missing.add(file);
  }

  console.log("");
  if (missing.size > 0) {
    console.log("Apply these files in the Supabase SQL editor, in this order, then re-run:");
    for (const file of ORDER.filter((f) => missing.has(f))) console.log(`  - ${file}`);
    process.exit(1);
  }
  console.log("Schema matches the code. Safe to deploy.");
}

main().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});
