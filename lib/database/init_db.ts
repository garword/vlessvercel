
import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
    console.error("❌ TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not found.");
    process.exit(1);
}

const db = createClient({ url, authToken });

async function init() {
    console.log("🚀 Initializing Database...");

    // 1. Users Table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS users (
            telegram_id TEXT PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            joined_at INTEGER
        )
    `);
    console.log("✅ Table 'users' ready.");

    // 2. CF Accounts Table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS cf_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id TEXT,
            email TEXT,
            api_token TEXT,
            account_id TEXT,
            zone_id TEXT,
            worker_domain TEXT,
            status TEXT DEFAULT 'active',
            last_used INTEGER DEFAULT 0
        )
    `);
    console.log("✅ Table 'cf_accounts' ready.");

    // 3. Wildcards Table
    await db.execute(`
        CREATE TABLE IF NOT EXISTS wildcards (
            domain TEXT PRIMARY KEY,
            added_by TEXT,
            created_at INTEGER
        )
    `);
    console.log("✅ Table 'wildcards' ready.");

    // 4. Active Nodes Table (Proxy Feeder)
    await db.execute("DROP TABLE IF EXISTS active_nodes"); // Force Reset
    await db.execute(`
        CREATE TABLE IF NOT EXISTS active_nodes (
            slot_id INTEGER PRIMARY KEY AUTOINCREMENT,
            proxy_ip TEXT,
            proxy_port INTEGER,
            country TEXT, 
            display_name TEXT,
            latency INTEGER,
            updated_at INTEGER
        )
    `);
    console.log("✅ Table 'active_nodes' ready.");

    // OPTIONAL: Seed Wildcards if empty
    const wcCount = await db.execute("SELECT count(*) as count FROM wildcards");
    if ((wcCount.rows[0] as any).count === 0) {
        await db.execute({
            sql: "INSERT INTO wildcards (domain, added_by, created_at) VALUES (?, ?, ?)",
            args: ["bug.com", "SYSTEM", Date.now()]
        });
        await db.execute({
            sql: "INSERT INTO wildcards (domain, added_by, created_at) VALUES (?, ?, ?)",
            args: ["classroom.google.com", "SYSTEM", Date.now()]
        });
        await db.execute({
            sql: "INSERT INTO wildcards (domain, added_by, created_at) VALUES (?, ?, ?)",
            args: ["m.udemy.com", "SYSTEM", Date.now()]
        });
        console.log("✅ Seeded default wildcards.");
    }

    console.log("🎉 Database initialization complete!");
}

init().catch(e => {
    console.error("Authentication Error or SQL Error:", e);
    process.exit(1);
});
