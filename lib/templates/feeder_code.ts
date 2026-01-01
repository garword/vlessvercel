export const FEEDER_SCRIPT = `
/**
 * Cloudflare Worker: Feeder & Rotator
 * Description: Fetches proxies from GitHub, updates Turso DB, and maintains the Elite 6 Slots.
 * Trigger: Cron Trigger (Every 1-2 minutes)
 */

import { createClient } from "@libsql/client/web";

export interface Env {
    TURSO_DATABASE_URL: string;
    TURSO_AUTH_TOKEN: string;
    GITHUB_PROXY_URL: string;
}

// Ensure types are available via imports or declare them if not using wrangler's global types
// For simplicity in this script context:
// import type { ExecutionContext, ScheduledEvent } from '@cloudflare/workers-types';
// We remove explicit type imports to avoid bundler issues in raw string, treating as any or generic

export default {
    async scheduled(event: any, env: Env, ctx: any): Promise<void> {
        console.log("⏰ Cron Triggered: Starting Proxy Update...");

        const client = createClient({
            url: env.TURSO_DATABASE_URL,
            authToken: env.TURSO_AUTH_TOKEN,
        });

        try {
            // 1. Fetch Proxies from GitHub (Raw)
            const resp = await fetch(env.GITHUB_PROXY_URL || "https://raw.githubusercontent.com/FoolVPN-ID/Nautica/main/proxyList.txt");
            if (!resp.ok) throw new Error("Failed to fetch from GitHub");

            const text = await resp.text();
            const lines = text.split("\\n").filter(l => l.trim().length > 0);

            const freshProxies = [];
            for (const line of lines) {
                // Format: IP,Port,CC,Org
                const parts = line.split(",");
                if (parts.length >= 4) {
                    const [ip, portStr, cc, org] = parts;
                    freshProxies.push({
                        ip: ip.trim(),
                        port: parseInt(portStr.trim()),
                        country: cc.trim().toUpperCase(),
                        org: org.trim() // STRICT: Keep raw org name
                    });
                }
            }

            console.log(\`📥 Fetched \${freshProxies.length} proxies from GitHub.\`);

            // 2. Update Proxy Pool (Upsert)
            const batchStmts = [];
            const timestamp = new Date().toISOString();

            for (const p of freshProxies) {
                if (isNaN(p.port)) continue;

                batchStmts.push({
                    sql: \`
                INSERT INTO proxy_pool (ip, port, country, org, status, last_updated)
                VALUES (?, ?, ?, ?, 'active', ?)
                ON CONFLICT(ip) DO UPDATE SET
                    port=excluded.port,
                    country=excluded.country,
                    org=excluded.org,
                    status='active',
                    last_updated=excluded.last_updated
            \`,
                    args: [p.ip, p.port, p.country, p.org, timestamp]
                });
            }

            // Execute Batch Upsert
            for (let i = 0; i < batchStmts.length; i += 50) {
                const chunk = batchStmts.slice(i, i + 50);
                await client.batch(chunk, "write");
            }

            // Mark old proxies as dead (not updated in last 5 mins)
            await client.execute({
                sql: "UPDATE proxy_pool SET status = 'dead' WHERE last_updated < datetime('now', '-5 minutes')",
                args: []
            });

            console.log("✅ Proxy Pool Updated.");

            // 3. Maintain "Elite 6" Slots
            await maintainSlots(client);

        } catch (e) {
            console.error("❌ Feeder Failed:", e);
        } finally {
            client.close();
        }
    },
};

// Logic to ensure 3 ID and 3 SG slots are filled
async function maintainSlots(client: any) {
    const slots = ["ID_1", "ID_2", "ID_3", "SG_1", "SG_2", "SG_3"];

    for (const slotId of slots) {
        const countryTarget = slotId.startsWith("ID") ? "ID" : "SG";

        // Get current slot info
        const rs = await client.execute({ sql: "SELECT * FROM active_nodes WHERE slot_id = ?", args: [slotId] });
        const currentSlot = rs.rows[0];

        let needReplace = false;

        // Scenario A: Slot is empty/placeholder
        if (!currentSlot || currentSlot.proxy_ip === "0.0.0.0") {
            needReplace = true;
        } else {
            // Scenario B: Check if current IP is still active in pool
            const poolCheck = await client.execute({
                sql: "SELECT status FROM proxy_pool WHERE ip = ?",
                args: [currentSlot.proxy_ip]
            });

            if (poolCheck.rows.length === 0 || poolCheck.rows[0].status === "dead") {
                console.log(\`⚠️ Slot \${slotId} (\${currentSlot.proxy_ip}) is DEAD. Replacing...\`);
                needReplace = true;
            }
        }

        if (needReplace) {
            // Find replacement from pool
            const replacementRes = await client.execute({
                sql: \`SELECT * FROM active_nodes
                       WHERE country = ? AND status = 'active' 
                       ORDER BY RANDOM() LIMIT 1\`,
                args: [countryTarget]
            });
            // Fixed query above to query proxy_pool not active_nodes for replacement
            
             const replacementResCorrect = await client.execute({
                sql: \`SELECT * FROM proxy_pool 
                       WHERE country = ? AND status = 'active' 
                       ORDER BY RANDOM() LIMIT 1\`,
                args: [countryTarget]
            });

            if (replacementResCorrect.rows.length > 0) {
                const newProxy = replacementResCorrect.rows[0];

                // SWAP IT IN!
                await client.execute({
                    sql: \`UPDATE active_nodes 
                           SET proxy_ip = ?, proxy_port = ?, display_name = ?
                           WHERE slot_id = ?\`,
                    args: [newProxy.ip, newProxy.port, newProxy.org, slotId]
                });

                console.log(\`♻️ Swapped \${slotId} -> \${newProxy.org} (\${newProxy.ip})\`);
            }
        }
    }
}
`;
