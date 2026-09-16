#!/usr/bin/env node

// Quick test to verify the new credentials and live connection
const https = require('https');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const key = serviceRoleKey || publicKey;

console.log("=== CREDENTIALS VERIFICATION ===");
console.log("Email: student@gmail.com");
console.log("Password: studentk123");
console.log("\n");

if (!supabaseUrl || !key) {
  console.log("❌ Missing Supabase credentials");
  process.exit(1);
}

console.log("✅ Supabase URL:", supabaseUrl);
console.log("✅ Key preview:", key.substring(0, 20) + "...");

// Test if we can reach the live application
const options = {
  hostname: 'library-cp22.onrender.com',
  port: 443,
  path: '/login',
  method: 'GET',
  headers: {
    'User-Agent': 'Node.js credential verification'
  },
  timeout: 10000
};

const req = https.request(options, (res) => {
  console.log("\n=== LIVE APPLICATION TEST ===");
  console.log("Status Code:", res.statusCode);
  console.log("Headers:", JSON.stringify(res.headers, null, 2));
});

req.on('error', (error) => {
  console.log("\n=== CONNECTION ERROR ===");
  console.log("Error:", error.message);
});

req.on('timeout', () => {
  console.log("\n=== CONNECTION TIMEOUT ===");
  console.log("The live application might not be accessible or might be behind firewall");
  req.destroy();
});

req.end();