export const FEEDER_SCRIPT = \`
/**
 * Cloudflare Worker: Feeder & Rotator (Zero-Dependency JS Version)
 * Description: Fetches proxies from GitHub, updates Turso DB via HTTP API.
 * Trigger: Cron Trigger
 */

export default {
    async scheduled(event, env, ctx) {
        console.log("⏰ Cron Triggered: Starting Proxy Update...");

        // Config
        const DB_URL = env.TURSO_DATABASE_URL;
        const DB_TOKEN = env.TURSO_AUTH_TOKEN;
        
        // Helper to execute SQL via Turso HTTP API
        async function executeSql(sql, args = []) {
            const url = \`\${DB_URL.replace("libsql://", "https://")}/v2/pipeline\`;
            
            // Convert args to LibSQL HTTP format
            // e.g. "active" -> { type: "text", value: "active" }
            const processedArgs = args.map(a => {
                if (typeof a === 'number') return { type: "float", value: a }; // LibSQL uses float for numbers usually via HTTP
                if (a === null) return { type: "null" };
                return { type: "text", value: String(a) };
            });

            const body = {
                requests: [
                    { type: "execute", stmt: { sql: sql, args: processedArgs } }
                ],
                close: true
            };

            const resp = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": \`Bearer \${DB_TOKEN}\`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            });

            if (!resp.ok) {
                const txt = await resp.text();
                throw new Error(\`Turso Error: \${txt}\`);
            }
            return await resp.json();
        }

        try {
            // 1. Fetch Proxies from GitHub (Raw)
            const resp = await fetch(env.GITHUB_PROXY_URL || "https://raw.githubusercontent.com/FoolVPN-ID/Nautica/main/proxyList.txt");
            if (!resp.ok) throw new Error("Failed to fetch from GitHub");

            const text = await resp.text();
            const lines = text.split("\\n").filter(l => l.trim().length > 0);

            const freshProxies = [];
            for (const line of lines) {
                const parts = line.split(",");
                if (parts.length >= 4) {
                    const [ip, portStr, cc, org] = parts;
                    freshProxies.push({
                        ip: ip.trim(),
                        port: parseInt(portStr.trim()),
                        country: cc.trim().toUpperCase(),
                        org: org.trim()
                    });
                }
            }

            console.log(\`📥 Fetched \${freshProxies.length} proxies from GitHub.\`);

            // 2. Update Proxy Pool (Upsert)
            // Note: HTTP API pipeline supports multiple requests in one go (Batch)
            // But for simplicity/robustness in JS loop, we'll do batches of statements.
            
            const timestamp = new Date().toISOString();
            const stmts = [];

            for (const p of freshProxies) {
                if (isNaN(p.port)) continue;
                stmts.push({
                    type: "execute",
                    stmt: {
                        sql: \`INSERT INTO proxy_pool (ip, port, country, org, status, last_updated)
                               VALUES (?, ?, ?, ?, 'active', ?)
                               ON CONFLICT(ip) DO UPDATE SET
                               port=excluded.port, country=excluded.country, org=excluded.org, status='active', last_updated=excluded.last_updated\`,
                        args: [
                             { type: "text", value: p.ip },
                             { type: "float", value: p.port },
                             { type: "text", value: p.country },
                             { type: "text", value: p.org },
                             { type: "text", value: timestamp }
                        ]
                    }
                });
            }

            // Execute Batches (Turso Pipeline Limit usually around 50-100 requests per pipeline if not careful)
            const BATCH_SIZE = 50;
            for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
                const chunk = stmts.slice(i, i + BATCH_SIZE);
                // Manual Pipeline Construction for chunk
                const body = { requests: chunk, close: true };
                
                const url = \`\${DB_URL.replace("libsql://", "https://")}/v2/pipeline\`;
                await fetch(url, {
                    method: "POST",
                    headers: { "Authorization": \`Bearer \${DB_TOKEN}\`, "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                });
            }
            
             // Mark Dead Proxies
             await executeSql("UPDATE proxy_pool SET status = 'dead' WHERE last_updated < datetime('now', '-5 minutes')", []);

             console.log("✅ Proxy Pool Updated.");

             // 3. Maintain Elite Slots
             await maintainSlotsHTTP(DB_URL, DB_TOKEN);

        } catch (e) {
            console.error("❌ Feeder Failed:", e);
        }
    }
};

async function maintainSlotsHTTP(dbUrl, dbToken) {
    const slots = ["ID_1", "ID_2", "ID_3", "SG_1", "SG_2", "SG_3"];
    const endpoint = \`\${dbUrl.replace("libsql://", "https://")}/v2/pipeline\`;

    // Helper for single SQL inside this fn
    const run = async (sql, args=[]) => {
         const processedArgs = args.map(a => (typeof a==='number'?{type:"float",value:a}:{type:"text",value:String(a)}));
         const resp = await fetch(endpoint, {
             method: "POST",
             headers: { "Authorization": \`Bearer \${dbToken}\`, "Content-Type": "application/json" },
             body: JSON.stringify({ requests: [{ type: "execute", stmt: { sql, args: processedArgs } }], close: true })
         });
         return (await resp.json()).results[0]; // { type: "ok", response: { result: { rows: [] } } }
    };

    for (const slotId of slots) {
        const countryTarget = slotId.startsWith("ID") ? "ID" : "SG";

        // Get current slot
        const rs = await run("SELECT * FROM active_nodes WHERE slot_id = ?", [slotId]);
        // Parse rows from HTTP response structure
        // LibSQL HTTP v2 returns cols and rows separately within result
        // Check logs structure if needed, but typically: response.result.rows (array of arrays) + response.result.cols
        // We need to map it carefully. For stability let's assume raw row object if strictly mapped, 
        // BUT LibSQL HRANA/V2 usually returns plain values.
        // Let's assume standard formatting or just simple checks.
        
        // Actually, pure HTTP API returns rows as array of values [[val1, val2]], need cols to map.
        // To simplify, let's just query if the specific IP exists/is active.
        
        // SIMPLIFIED LOGIC FOR JS:
        // We assume we want to fill slots.
        
        // 1. Check if slot needs update
        // We'll just run a complex query to find ONE replacement if the slot is dead/empty
        
        // Using a transaction-like replacement would be better, but here we iterate.
        // To be safe in JS without complex Row Mapping:
        // We select the current proxy for the slot.
        // If it's dead/missing, we select a random active one from pool and update.
        
        // For simplicity in this script, let's rely on the DB 'UPDATE' logic directly using SQL if possible
        // OR just do it blindly for now (rotate every time?) -> No, that kills active connections.
        
        // Let's try to map the row.
        // Structure: result: { cols: [{name: "proxy_ip"}, ...], rows: [ [ {type: "text", value: "1.1.1.1"} ... ] ] }
        
        let currentIp = "0.0.0.0";
        if (rs.response.result.rows.length > 0) {
             // active_nodes columns: slot_id, proxy_ip, proxy_port, display_name, last_updated
             // We need to find the index of proxy_ip
             const cols = rs.response.result.cols; 
             const ipIdx = cols.findIndex(c => c.name === "proxy_ip");
             const valObj = rs.response.result.rows[0][ipIdx]; // { type: "text", value: "..." }
             currentIp = valObj.value;
        }

        let needReplace = (currentIp === "0.0.0.0");
        
        if (!needReplace) {
             // Check status in pool
             const poolCheck = await run("SELECT status FROM proxy_pool WHERE ip = ?", [currentIp]);
             if (poolCheck.response.result.rows.length === 0) {
                 needReplace = true; // Not in pool
             } else {
                 const statusVal = poolCheck.response.result.rows[0][0].value;
                 if (statusVal === 'dead') needReplace = true;
             }
        }

        if (needReplace) {
             // Find replacement
             const rep = await run(\`SELECT * FROM proxy_pool WHERE country = ? AND status = 'active' ORDER BY RANDOM() LIMIT 1\`, [countryTarget]);
             if (rep.response.result.rows.length > 0) {
                 // Map result
                 const rCols = rep.response.result.cols;
                 const rRow = rep.response.result.rows[0];
                 
                 const getVal = (name) => {
                     const idx = rCols.findIndex(c => c.name === name);
                     return rRow[idx].value;
                 };
                 
                 const newIp = getVal("ip");
                 const newPort = getVal("port");
                 const newOrg = getVal("org");

                 // Update Slot
                 await run(\`UPDATE active_nodes SET proxy_ip = ?, proxy_port = ?, display_name = ? WHERE slot_id = ?\`, 
                     [newIp, Number(newPort), newOrg, slotId]);
                 
                 console.log(\`♻️ Swapped \${slotId} -> \${newOrg} (\${newIp})\`);
             }
        }
    }
}
\`;\n
