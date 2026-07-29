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

// Use role labels — not invented personal names like "Morgan Ellis".
const demoUsers = [
  {
    name: "Demo Student",
    email: "student@gmail.com",
    password: "studentkerr123",
    role: "student",
  },
  {
    name: "Demo Librarian",
    email: "librarian@gmail.com",
    password: "librariankerr123",
    role: "librarian",
  },
  {
    name: "Demo Admin",
    email: "admin@gmail.com",
    password: "adminkerr123",
    role: "admin",
  },
];

// Older seeds used made-up personal names / other demo emails. Scrub them so
// the live desk no longer shows those placeholders after a re-seed.
const retiredFakeNames = ["Morgan Ellis", "Alex Rivera"];
const retiredDemoEmails = [
  "admin@shelfwalk.app",
  "librarian@shelfwalk.app",
  "admin@trac.app",
  "librarian@trac.app",
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
      console.log(`✓ Updated ${demo.email} / ${demo.password} (${demo.name})`);
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
    console.log(`✓ Created ${demo.email} / ${demo.password} (${demo.name})`);
  }
}

for (const email of retiredDemoEmails) {
  const { data: rows, error } = await supabase
    .from("users")
    .select("id, email, name, role")
    .ilike("email", email);

  if (error) {
    hadError = true;
    console.error(`✗ Could not look up retired demo ${email}: ${error.message}`);
    continue;
  }

  for (const row of rows ?? []) {
    const replacement =
      row.role === "admin"
        ? "Demo Admin"
        : row.role === "librarian"
          ? "Demo Librarian"
          : "Demo Student";
    const { error: updateError } = await supabase
      .from("users")
      .update({ name: replacement })
      .eq("id", row.id);

    if (updateError) {
      hadError = true;
      console.error(`✗ Failed to rename ${row.email}: ${updateError.message}`);
    } else {
      console.log(`✓ Renamed ${row.email}: "${row.name}" → "${replacement}"`);
    }
  }
}

for (const fakeName of retiredFakeNames) {
  const { data: rows, error } = await supabase
    .from("users")
    .select("id, email, name, role")
    .eq("name", fakeName);

  if (error) {
    hadError = true;
    console.error(`✗ Could not look up fake name ${fakeName}: ${error.message}`);
    continue;
  }

  for (const row of rows ?? []) {
    const replacement =
      row.role === "admin"
        ? "Demo Admin"
        : row.role === "librarian"
          ? "Demo Librarian"
          : "Demo Student";
    const { error: updateError } = await supabase
      .from("users")
      .update({ name: replacement })
      .eq("id", row.id);

    if (updateError) {
      hadError = true;
      console.error(`✗ Failed to rename ${row.email}: ${updateError.message}`);
    } else {
      console.log(`✓ Renamed ${row.email}: "${fakeName}" → "${replacement}"`);
    }
  }
}

if (hadError) {
  process.exit(1);
}

console.log("\nDone. Sign in at /login with:");
for (const demo of demoUsers) {
  console.log(`  ${demo.role.padEnd(10)} ${demo.email} / ${demo.password}`);
}
