
import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
    console.error("❌ Missing TURSO credentials in .env.local");
    process.exit(1);
}

const client = createClient({ url, authToken });

async function migrate() {
    console.log("🚀 Starting DB Migration: Feeder Instances...");

    try {
        await client.execute(`
            CREATE TABLE IF NOT EXISTS feeder_instances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                worker_name TEXT NOT NULL,
                account_id TEXT NOT NULL,
                api_token TEXT NOT NULL,
                created_at INTEGER
            );
        `);
        console.log("✅ Table 'feeder_instances' created/verified.");
    } catch (e) {
        console.error("❌ Migration Failed:", e);
    } finally {
        client.close();
    }
}

migrate();
