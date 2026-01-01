export const FEEDER_SCRIPT = `
/**
 * Cloudflare Worker: Feeder & Rotator (Zero-Dependency JS Version)
 * Description: Fetches proxies from GitHub, updates Turso DB via HTTP API.
 * Trigger: Cron Trigger
 */

export default {
    async fetch(request, env, ctx) {
        // Validation
        if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
             return new Response("❌ Error: TURSO Credentials missing in Worker Environment.", { status: 500 });
        }

        // Capture Logs
        const logs = [];
        const log = (...args) => logs.push(args.map(a => String(a)).join(" "));
        const error = (...args) => logs.push("ERROR: " + args.map(a => String(a)).join(" "));
        
        // Manual Trigger via HTTP
        const url = new URL(request.url);
        if (url.pathname === "/") {
            try {
                await this.runLogic(env, log, error);
                return new Response(\`✅ Feeder Execution Finished.\\n\\nLogs:\\n\${logs.join("\\n")}\`, { status: 200 });
            } catch (e) {
                 return new Response(\`❌ Feeder Execution Failed.\\n\\nLogs:\\n\${logs.join("\\n")}\\n\\nFatal Error: \${e.message}\\nStack: \${e.stack}\`, { status: 500 });
            }
        }
        return new Response("Feeder Worker Active. Visit / to trigger.", { status: 200 });
    },

    async scheduled(event, env, ctx) {
        // Cron trigger uses standard console
        await this.runLogic(env, console.log, console.error);
    },

    // Shared Logic
    async runLogic(env, log, error) {
        log("⏰ Cron/Manual Triggered: Starting Proxy Update...");

        // Config
        const DB_URL = env.TURSO_DATABASE_URL;
        const DB_TOKEN = env.TURSO_AUTH_TOKEN;
        
        // Helper to execute SQL via Turso HTTP API
        async function executeSql(sql, args = []) {
            const url = \`\${DB_URL.replace("libsql://", "https://")}/v2/pipeline\`;
            
            const processedArgs = args.map(a => {
                if (typeof a === 'number') return { type: "float", value: a }; 
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
                throw new Error(\`Turso Error (\${resp.status}): \${txt}\`);
            }
            return await resp.json();
        }

        try {
            // 1. Fetch Proxies from GitHub (Raw)
            const proxyUrl = env.GITHUB_PROXY_URL || "https://raw.githubusercontent.com/FoolVPN-ID/Nautica/main/proxyList.txt";
            log(\`Fetching from: \${proxyUrl}\`);
            
            const resp = await fetch(proxyUrl);
            if (!resp.ok) throw new Error(\`Failed to fetch from GitHub: \${resp.status}\`);

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

            log(\`📥 Fetched \${freshProxies.length} proxies from GitHub.\`);

            // 2. Update Proxy Pool (Upsert)
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

            // Execute Batches
            const BATCH_SIZE = 50;
            for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
                const chunk = stmts.slice(i, i + BATCH_SIZE);
                const body = { requests: chunk, close: true };
                
                const url = \`\${DB_URL.replace("libsql://", "https://")}/v2/pipeline\`;
                const batchResp = await fetch(url, {
                    method: "POST",
                    headers: { "Authorization": \`Bearer \${DB_TOKEN}\`, "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                });
                
                if (!batchResp.ok) {
                     const txt = await batchResp.text();
                     error(\`Batch Insert Failed part \${i}: \${txt}\`);
                }
            }
            
             // Mark Dead Proxies
             await executeSql("UPDATE proxy_pool SET status = 'dead' WHERE last_updated < datetime('now', '-5 minutes')", []);

             log("✅ Proxy Pool Updated.");

             // 3. Maintain Elite Slots
             await maintainSlotsHTTP(DB_URL, DB_TOKEN, log);

        } catch (e) {
            error("Feeder Failed:", e.message);
            // Re-throw for manual trigger to catch
            throw e;
        }
    }
};

async function maintainSlotsHTTP(dbUrl, dbToken, log) {
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
         return (await resp.json()).results[0]; 
    };

    for (const slotId of slots) {
        const countryTarget = slotId.startsWith("ID") ? "ID" : "SG";

        try {
            // Get current slot
            const rs = await run("SELECT * FROM active_nodes WHERE slot_id = ?", [slotId]);
            
            let currentIp = "0.0.0.0";
            if (rs.response.result.rows.length > 0) {
                 const cols = rs.response.result.cols; 
                 const ipIdx = cols.findIndex(c => c.name === "proxy_ip");
                 const valObj = rs.response.result.rows[0][ipIdx];
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
                     
                     log(\`♻️ Swapped \${slotId} -> \${newOrg} (\${newIp})\`);
                 } else {
                     log(\`⚠️ No replacement found for \${slotId}\`);
                 }
            }
        } catch(e) {
            log(\`❌ Error processing slot \${slotId}: \${e.message}\`);
        }
    }
}
`;
