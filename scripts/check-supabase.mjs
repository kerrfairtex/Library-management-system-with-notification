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
    console.log("\nDemo credentials are ready to use:");
    console.log("  Student:   student@gmail.com / studentk123");
    console.log("  Librarian: librarian@gmail.com / librarian123");
    console.log("  Admin:     admin@gmail.com / admin123");
  }
}

main().catch(error => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});