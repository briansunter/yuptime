/**
 * Test database connection and schema
 */

import { Database } from "bun:sqlite";

async function testDatabase() {
  console.log("Opening database...");
  const sqlite = new Database("/data/yuptime.db");

  try {
    // Check sessions table exists
    const schemasResult = sqlite.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='sessions';
    `).all();

    console.log("✓ Sessions table exists:", schemasResult.length > 0);

    // Get table schema
    const schema = sqlite.prepare(`PRAGMA table_info(sessions);`).all();
    console.log("✓ Sessions table schema:");
    schema.forEach((col: any) => {
      console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? 'DEFAULT ' + col.dflt_value : ''}`);
    });

    // Count existing sessions
    const countResult = sqlite.prepare(`SELECT COUNT(*) as count FROM sessions;`).get() as any;
    console.log("✓ Sessions in database:", countResult.count);

    // Try a test insert
    console.log("\n✓ Attempting test insert...");
    try {
      const stmt = sqlite.prepare(`
        INSERT INTO sessions (id, userId, username, role, tokenHash, createdAt, expiresAt, lastActivityAt, ipAddress, userAgent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        "test-session-id",
        "default/testuser",
        "testuser",
        "admin",
        "abcdef123456",
        new Date().toISOString(),
        new Date(Date.now() + 3600000).toISOString(),
        new Date().toISOString(),
        "127.0.0.1",
        "test-agent"
      );

      console.log("✓ Test insert succeeded!");

      // Verify
      const verify = sqlite.prepare(`SELECT * FROM sessions WHERE id = ?;`).get("test-session-id");
      console.log("✓ Verification:", verify);
    } catch (insertError: any) {
      console.error("✗ Test insert failed:", insertError.message);
      console.error("  Error details:", insertError);
    }

  } finally {
    sqlite.close();
  }
}

testDatabase().catch(console.error);
