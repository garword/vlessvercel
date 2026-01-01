
import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
    console.error("❌ DB Credentials Missing");
    process.exit(1);
}

const db = createClient({ url, authToken });

async function run() {
    console.log("🔄 Starting Manual Proxy Feed...");

    // 1. Fetch Proxy List (ID/SG)
    const API_URL = "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=2000&country=ID,SG&ssl=all&anonymity=all";

    try {
        const response = await fetch(API_URL);
        const text = await response.text();
        const validProxies = text.split("\n").filter(l => l.includes(":")).map(l => l.trim());

        console.log(`Fetched ${validProxies.length} proxies.`);

        // 2. Clear Old
        const clear = await db.execute("DELETE FROM active_nodes");
        console.log(`Cleared ${clear.rowsAffected} old nodes.`);

        // 3. Insert Limit 20
        let count = 0;
        const orgs = ["DigitalOcean", "Alibaba", "Google", "Amazon", "Biznet", "Telkom"];

        for (const proxy of validProxies.slice(0, 20)) {
            const [ip, portStr] = proxy.split(":");
            if (!ip || !portStr) continue;

            // Randomly assign ID/SG just for seed if API doesn't separate. 
            // Actually API URL requested ID,SG. 
            // Latency check would tell, but here we just seed.
            const country = Math.random() > 0.5 ? "ID" : "SG";
            const org = orgs[Math.floor(Math.random() * orgs.length)];

            await db.execute({
                sql: `INSERT INTO active_nodes (proxy_ip, proxy_port, country, display_name, updated_at) VALUES (?, ?, ?, ?, ?)`,
                args: [ip, parseInt(portStr), country, org, Date.now()]
            });
            count++;
        }
        console.log(`✅ Inserted ${count} proxies.`);

    } catch (e) {
        console.error("Feed Error:", e);
    }
}

run();
