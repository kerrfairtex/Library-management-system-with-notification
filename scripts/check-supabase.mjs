import https from 'https';
import http from 'http';

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
console.log(`Using key: ${key.substring(0, 20)}...`);

// Simple HTTP request function
const makeRequest = (url, options) => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    const urlObj = new URL(url);
    
    const headers = {
      'Authorization': `Bearer ${key}`,
      'apikey': key,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    };
    
    const req = protocol.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: headers,
      timeout: options.timeout || 10000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsedData = data ? JSON.parse(data) : null;
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsedData,
          });
        } catch (parseError) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data,
            parseError: parseError.message,
          });
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function checkTable(table) {
  try {
    console.log(`\nChecking table: ${table}...`);
    
    const url = `${supabaseUrl}/rest/v1/${table}?select=id&limit=1`;
    const options = {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${key}`,
        'apikey': key,
        'Content-Type': 'application/json',
        'Prefer': 'count=estimated',
      },
      timeout: 15000,
    };
    
    const response = await makeRequest(url, options);
    
    if (response.status >= 200 && response.status < 300) {
      console.log(`✓ ${table.padEnd(14)} reachable (HTTP ${response.status})`);
      return true;
    } else {
      console.log(`✗ ${table.padEnd(14)} HTTP ${response.status}: ${JSON.stringify(response.data) || 'Unknown error'}`);
      
      if (response.status === 404) {
        console.log(`  → Table '${table}' does not exist - run supabase/schema.sql first`);
      } else if (response.status === 401) {
        console.log(`  → Authentication failed - check your SUPABASE_SECRET_KEY`);
      }
      return false;
    }
    
  } catch (error) {
    console.log(`✗ ${table.padEnd(14)} Network error: ${error.message}`);
    return false;
  }
}

async function main() {
  const tables = ["users", "books", "members", "loans", "notifications"];
  const results = {};
  
  for (const table of tables) {
    results[table] = await checkTable(table);
  }
  
  console.log("\n");
  const failedTables = tables.filter(table => !results[table]);
  
  if (failedTables.length > 0) {
    console.log(`Some tables are not reachable. Failed: ${failedTables.join(', ')}`);
    console.log("Fix the items above, then re-run this script.");
    process.exit(1);
  } else {
    console.log("All tables are reachable. You can proceed with the setup!");
    console.log("\nDemo credentials are ready to use:")
    console.log("  Student:   student@gmail.com / studentkerr123")
    console.log("  Librarian: librarian@gmail.com / librariankerr123")
    console.log("  Admin:     admin@gmail.com / adminkerr123")
  }
}

main().catch(error => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});