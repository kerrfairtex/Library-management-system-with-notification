#!/usr/bin/env node
/**
 * AUTO-SEED CREDENTIALS SCRIPT
 * Automatically handles environment detection and credential management
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from 'crypto';

// Configuration with your exact project details
const CONFIG = {
  SUPABASE_URL: process.env.SUPABASE_URL || 'https://cphkxgykshjeultzgzmz.supabase.co',
  // Use whichever key is available (prefer service role)
  SERVICE_KEY: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
};

// Required credentials
const REQUIRED_CREDENTIALS = {
  STUDENT: { email: 'student@gmail.com', password: 'student123', role: 'student' },
  LIBRARIAN: { email: 'librarian@gmail.com', password: 'librarian123', role: 'librarian' },
  ADMIN: { email: 'admin@gmail.com', password: 'admin123', role: 'admin' }
};

console.log('🔍 AUTO-SEED CREDENTIALS VERIFICATION');
console.log('====================================');

// Validate configuration
if (!CONFIG.SERVICE_KEY) {
  console.error('❌ ERROR: No Supabase service key found');
  console.error('Please set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY environment variable');
  process.exit(1);
}

console.log(`✅ Supabase URL: ${CONFIG.SUPABASE_URL}`);
console.log(`✅ Service Key: ${CONFIG.SERVICE_KEY.substring(0, 20)}...`);

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SERVICE_KEY);

// Secure password hashing
function hashPassword(password, salt = null) {
  const crypto = require('crypto');
  if (!salt) salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// User accounts to process
const demoUsers = [
  REQUIRED_CREDENTIALS.STUDENT,
  REQUIRED_CREDENTIALS.LIBRARIAN,
  REQUIRED_CREDENTIALS.ADMIN
];

async function upsertUser(user) {
  try {
    // Check if user exists
    const { data: existing, error: findError } = await supabase
      .from("users")
      .select("id")
      .ilike("email", user.email)
      .maybeSingle();
    
    if (findError && findError.code !== 'PGRST116') {
      console.error(`❌ Query error for ${user.email}: ${findError.message}`);
      return false;
    }
    
    const passwordHash = hashPassword(user.password);
    
    if (existing) {
      // Update existing user
      const { error: updateError } = await supabase
        .from("users")
        .update({
          name: `Demo ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}`,
          password_hash: passwordHash,
          role: user.role,
          status: 'active'
        })
        .eq("id", existing.id);
      
      if (updateError) {
        console.error(`❌ Update failed for ${user.email}: ${updateError.message}`);
        return false;
      }
      console.log(`✅ Updated ${user.email} / ${user.password}`);
      return true;
    }
    
    // Create new user
    const { error: insertError } = await supabase.from("users").insert({
      id: randomUUID(),
      name: `Demo ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}`,
      email: user.email,
      password_hash: passwordHash,
      role: user.role,
      status: 'active',
      created_at: new Date().toISOString()
    });
    
    if (insertError) {
      console.error(`❌ Create failed for ${user.email}: ${insertError.message}`);
      return false;
    }
    console.log(`✅ Created ${user.email} / ${user.password}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Operation failed for ${user.email}: ${error.message}`);
    return false;
  }
}

// Main execution
async function main() {
  let successCount = 0;
  let errorCount = 0;
  
  for (const user of demoUsers) {
    const success = await upsertUser(user);
    if (success) successCount++;
    else errorCount++;
  }
  
  console.log('\n📊 Summary:');
  console.log(`✅ Successful: ${successCount}/${demoUsers.length}`);
  if (errorCount > 0) {
    console.log(`❌ Failed: ${errorCount}/${demoUsers.length}`);
    process.exit(1);
  }
  
  console.log('\n🎉 Done! Test credentials are:');
  demoUsers.forEach(u => {
    console.log(`   ${u.role.padEnd(10)} ${u.email} / ${u.password}`);
  });
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});