/**
 * Test CRD query
 */

import { Database } from "bun:sqlite";

async function testCrdQuery() {
  console.log("Opening database...");
  const sqlite = new Database("/data/yuptime.db");

  try {
    // Check crd_cache table
    const schemasResult = sqlite.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='crd_cache';
    `).all();

    console.log("✓ crd_cache table exists:", schemasResult.length > 0);

    // Try a simple SELECT
    console.log("\n✓ Testing SELECT * FROM crd_cache");
    const allCrds = sqlite.prepare(`SELECT * FROM crd_cache;`).all();
    console.log("✓ Found", allCrds.length, "CRDs");

    // Try filtering by kind
    console.log("\n✓ Testing SELECT with WHERE kind = 'LocalUser'");
    const localUsers = sqlite.prepare(`SELECT * FROM crd_cache WHERE kind = 'LocalUser';`).all();
    console.log("✓ Found", localUsers.length, "LocalUsers");
    localUsers.forEach((u: any) => {
      console.log(`  - ${u.namespace}/${u.name}: spec=${u.spec?.substring(0, 50)}...`);
    });

  } catch (error: any) {
    console.error("✗ Error:", error.message);
    console.error("  Details:", error);
  } finally {
    sqlite.close();
  }
}

testCrdQuery().catch(console.error);
