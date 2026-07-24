#!/usr/bin/env node
// Creates or updates the demo librarian/admin accounts in the Supabase
// `users` table so the login page has working credentials.
//
// Usage:
//   node --env-file=.env.local scripts/seed-users.mjs
//
// Requires SUPABASE_URL and a server-side key: either the new
// SUPABASE_SECRET_KEY (sb_secret_...) or the legacy
// SUPABASE_SERVICE_ROLE_KEY — the same variables the app's API routes
// use, see src/lib/supabase.ts.

import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY).\n" +
      "Run this with your env file loaded, e.g.:\n" +
      "  node --env-file=.env.local scripts/seed-users.mjs"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Mirrors hashPassword() in src/lib/auth.ts (salt:scrypt-hash hex string).
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const demoUsers = [
  {
    name: "Alex Rivera",
    email: "librarian@shelfwalk.app",
    password: "librarian123",
    role: "librarian",
  },
  {
    name: "Morgan Ellis",
    email: "admin@shelfwalk.app",
    password: "admin123",
    role: "admin",
  },
];

let hadError = false;

for (const demo of demoUsers) {
  const { data: existing, error: findError } = await supabase
    .from("users")
    .select("id")
    .ilike("email", demo.email)
    .maybeSingle();

  if (findError) {
    hadError = true;
    console.error(
      `✗ Could not check ${demo.email}: ${findError.message}\n` +
        "  Has supabase/schema.sql been run against this project yet?"
    );
    continue;
  }

  const passwordHash = hashPassword(demo.password);

  if (existing) {
    const { error: updateError } = await supabase
      .from("users")
      .update({
        name: demo.name,
        password_hash: passwordHash,
        role: demo.role,
      })
      .eq("id", existing.id);

    if (updateError) {
      hadError = true;
      console.error(`✗ Failed to update ${demo.email}: ${updateError.message}`);
    } else {
      console.log(`✓ Updated ${demo.email} / ${demo.password}`);
    }
    continue;
  }

  const { error: insertError } = await supabase.from("users").insert({
    id: randomUUID(),
    name: demo.name,
    email: demo.email,
    password_hash: passwordHash,
    role: demo.role,
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    hadError = true;
    console.error(`✗ Failed to create ${demo.email}: ${insertError.message}`);
  } else {
    console.log(`✓ Created ${demo.email} / ${demo.password}`);
  }
}

if (hadError) {
  process.exit(1);
}

console.log("\nDone. Sign in at /login with:");
for (const demo of demoUsers) {
  console.log(`  ${demo.role.padEnd(10)} ${demo.email} / ${demo.password}`);
}
