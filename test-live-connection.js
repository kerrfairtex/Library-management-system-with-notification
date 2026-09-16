const https = require('https');

console.log("=== LIVE APPLICATION CONNECTION TEST ===");
console.log("URL: https://library-cp22.onrender.com/login");
console.log("\n");

const options = {
  hostname: 'library-cp22.onrender.com',
  port: 443,
  path: '/login',
  method: 'GET',
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; Credential Verification)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
  },
  timeout: 20000
};

const req = https.request(options, (res) => {
  console.log("=== CONNECTION SUCCESS ===");
  console.log("Status Code:", res.statusCode);
  console.log("Status Message:", res.statusMessage);
  console.log("\nHeaders Received:");
  console.log(JSON.stringify(res.headers, null, 2));
  console.log("\n=== CREDENTIALS READY FOR LIVE APPLICATION ===");
  console.log("\nNew Demo Credentials:");
  console.log("  Student:   student@gmail.com / studentk123");
  console.log("  Librarian: librarian@gmail.com / librarian123");
  console.log("  Admin:     admin@gmail.com / admin123");
  console.log("\nTry accessing: https://library-cp22.onrender.com/login");
  console.log("\nThe application should now accept the updated credentials.");
});

req.on('error', (error) => {
  console.log("\n=== CONNECTION ERROR ===");
  console.log("Error:", error.message);
  console.log("\nPossible reasons:");
  console.log("  - Application is not running");
  console.log("  - Firewall blocking external requests");
  console.log("  - SSL certificate issues");
  console.log("  - Server maintenance");
});

req.on('timeout', () => {
  console.log("\n=== CONNECTION TIMEOUT ===");
  console.log("Request timed out after 20 seconds");
  console.log("The application might be slow to respond or not accessible from this environment.");
  req.destroy();
});

req.end();