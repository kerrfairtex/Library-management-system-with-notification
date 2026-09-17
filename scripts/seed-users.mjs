#!/usr/bin/env node
/**
 * DEMO USER SEEDING SCRIPT
 * Automatically creates/updates demo accounts with exact credentials
 * Credentials: student:student123, librarian:librarian123, admin:admin123
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from 'crypto';

// Auto-detect and validate environment variables
const CONFIG = {
  URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  KEY: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
};

// Exact credentials as requested
const DEMO_USERS = [
  { name: "Demo Student",   email: "student@gmail.com",   password: "student123",   role: "student" },
  { name: "Demo Librarian", email: "librarian@gmail.com", password: "librarian123",  role: "librarian" },
  { name: "Demo Admin",     email: "admin@gmail.com",     password: "admin123",     role: "admin" }
];

console.log('🔧 Starting demo user seeding...');

// Validate configuration
if (!CONFIG.URL) {
  console.error('❌ Error: SUPABASE_URL not set in environment');
  process.exit(1);
}

if (!CONFIG.KEY) {
  console.error('❌ Error: No Supabase key found (SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

console.log(`✅ Supabase URL: ${CONFIG.URL}`);
console.log(`✅ Using key: ${CONFIG.KEY.substring(0, 20)}...`);

// Initialize Supabase client
const supabase = createClient(CONFIG.URL, CONFIG.KEY);

// Secure password hashing with salt
function hashPassword(password, salt = null) {
  const crypto = require('crypto');
  if (!salt) salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// Process each demo user
async function processUser(user) {
  try {
    // Check if user exists
    const { data: existing, error: findError } = await supabase
      .from("users")
      .select("id")
      .ilike("email", user.email)
      .maybeSingle();
    
    if (findError && findError.code !== 'PGRST116') {
      throw new Error(findError.message);
    }
    
    const passwordHash = hashPassword(user.password);
    
    if (existing) {
      // Update existing user
      const { error: updateError } = await supabase
        .from("users")
        .update({
          name: user.name,
          password_hash: passwordHash,
          role: user.role,
          status: 'active'
        })
        .eq("id", existing.id);
      
      if (updateError) throw new Error(updateError.message);
      console.log(`✅ Updated ${user.email} / ${user.password}`);
    } else {
      // Create new user
      const { error: insertError } = await supabase.from("users").insert({
        id: randomUUID(),
        name: user.name,
        email: user.email,
        password_hash: passwordHash,
        role: user.role,
        status: 'active',
        created_at: new Date().toISOString()
      });
      
      if (insertError) throw new Error(insertError.message);
      console.log(`✅ Created ${user.email} / ${user.password}`);
    }
    return true;
  } catch (error) {
    console.error(`❌ Failed for ${user.email}: ${error.message}`);
    return false;
  }
}

// Main execution
(async () => {
  let success = 0;
  let failed = 0;
  
  for (const user of DEMO_USERS) {
    const done = await processUser(user);
    done ? success++ : failed++;
  }
  
  if (failed > 0) {
    process.exit(1);
  }
  
  console.log(`\n✅ Done! Created/Updated ${success} demo accounts`);
  console.log('\nLogin credentials:');
  DEMO_USERS.forEach(u => {
    console.log(`  ${u.role.padEnd(10)} ${u.email} / ${u.password}`);
  });
})().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});