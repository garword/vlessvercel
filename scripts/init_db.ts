
import { createClient } from "@libsql/client";

const url = "libsql://vlesskuy-vlesskuyu.aws-ap-northeast-1.turso.io";
const authToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjcyNTE1OTgsImlkIjoiYzAxYzAwYjYtY2Q1My00NmQ0LWE4MjAtZTkzZGVhODg3YjVmIiwicmlkIjoiNTNlNTBkODItNzlhZi00ZmE4LTliODctMzRiMDJjNzEzODM1In0.d6ozCTxASOGn_eKIWlMM6wGQqej84RCWi_C_mdZnlsJJwM4pAZqC3c6SZVxisN1vcKQAxvMHQOXa6i3jfD_NCQ";

const client = createClient({
    url,
    authToken,
});

async function main() {
    console.log("🔌 Connecting to Turso...");

    try {
        // 1. Create proxy_pool Table
        console.log("🛠️ Creating table: proxy_pool");
        await client.execute(`
      CREATE TABLE IF NOT EXISTS proxy_pool (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT UNIQUE NOT NULL,
        port INTEGER NOT NULL,
        country TEXT NOT NULL, -- ID, SG, etc
        org TEXT NOT NULL,
        latency INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active', -- active, dead
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

        // 2. Create active_nodes Table (The Elite 6)
        console.log("🛠️ Creating table: active_nodes");
        await client.execute(`
      CREATE TABLE IF NOT EXISTS active_nodes (
        slot_id TEXT PRIMARY KEY, -- ID_1, ID_2, ID_3, SG_1, SG_2, SG_3
        proxy_ip TEXT NOT NULL,
        proxy_port INTEGER NOT NULL,
        display_name TEXT NOT NULL, -- Synced with ORG (e.g. "Biznet Networks")
        cf_account_id TEXT DEFAULT 'default' -- For rotation later
      );
    `);

        console.log("✅ Tables created successfully!");

        // 3. Initial Seed (Optional: Create Slots if empty)
        const slots = ["ID_1", "ID_2", "ID_3", "SG_1", "SG_2", "SG_3"];

        for (const slot of slots) {
            // Check if slot exists
            const res = await client.execute({ sql: "SELECT slot_id FROM active_nodes WHERE slot_id = ?", args: [slot] });
            if (res.rows.length === 0) {
                console.log(`🌱 Seeding empty slot: ${slot}`);
                // Insert placeholder (Worker will update this real quick)
                await client.execute({
                    sql: "INSERT INTO active_nodes (slot_id, proxy_ip, proxy_port, display_name) VALUES (?, ?, ?, ?)",
                    args: [slot, "0.0.0.0", 443, "Waiting for Feeder..."]
                });
            }
        }

        console.log("🎉 Database initialization complete!");

    } catch (e) {
        console.error("❌ Error initializing database:", e);
    } finally {
        client.close();
    }
}

main();
