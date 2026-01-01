export const FEEDER_SCRIPT = `
/**
 * Cloudflare Worker: Feeder & Rotator (OPTIMIZED)
 * Description: Fetches only minimal proxies (ID/SG) to avoid Subrequest Limits.
 * Trigger: Cron Trigger / Manual HTTP
 */

export default {
    async fetch(request, env, ctx) {
        // Validation
        if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
             return new Response("❌ Error: TURSO Credentials missing.", { status: 500 });
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
                return new Response(\`✅ Feeder Execution Finished (Optimized).\\n\\nLogs:\\n\${logs.join("\\n")}\`, { status: 200 });
            } catch (e) {
                 return new Response(\`❌ Feeder Failed.\\n\\nLogs:\\n\${logs.join("\\n")}\\n\\nFatal Error: \${e.message}\\nStack: \${e.stack}\`, { status: 500 });
            }
        }
        return new Response("Feeder Worker Active. Visit / to trigger.", { status: 200 });
    },

    async scheduled(event, env, ctx) {
        await this.runLogic(env, console.log, console.error);
    },

    // Shared Logic
    async runLogic(env, log, error) {
        log("⏰ Starting Optimized Proxy Update...");

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

            // 2. PARSE & FILTER IN MEMORY (Avoid DB Overload)
            const allProxies = [];
            for (const line of lines) {
                const parts = line.split(",");
                if (parts.length >= 4) {
                    const [ip, portStr, cc, org] = parts;
                    allProxies.push({
                        ip: ip.trim(),
                        port: parseInt(portStr.trim()),
                        country: cc.trim().toUpperCase(),
                        org: org.trim()
                    });
                }
            }
            log(\`📥 Total parsed: \${allProxies.length}\`);

            // STRATEGY: Get random 5 ID and 5 SG only
            const idProxies = allProxies.filter(p => p.country === 'ID');
            const sgProxies = allProxies.filter(p => p.country === 'SG');
            
            const selectedProxies = [];
            
            // Random Shuffle & Pick 5
            const pickRandom = (arr, count) => arr.sort(() => 0.5 - Math.random()).slice(0, count);
            
            selectedProxies.push(...pickRandom(idProxies, 5));
            selectedProxies.push(...pickRandom(sgProxies, 5));
            
            log(\`🎯 Selected Candidates: \${selectedProxies.length} (ID & SG)\`);
            
            if (selectedProxies.length === 0) {
                 log("⚠️ No ID/SG proxies found in source! Aborting update.");
                 return;
            }

            // 3. Batch Insert ONLY Selected Proxies (1 Fetch Call)
            const timestamp = new Date().toISOString();
            const stmts = [];

            for (const p of selectedProxies) {
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

            // Execute Batch (One HUGE request instead of 50)
            const body = { requests: stmts, close: true };
            const batchUrl = \`\${DB_URL.replace("libsql://", "https://")}/v2/pipeline\`;
            
            const batchResp = await fetch(batchUrl, {
                method: "POST",
                headers: { "Authorization": \`Bearer \${DB_TOKEN}\`, "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            
            if (!batchResp.ok) {
                 const txt = await batchResp.text();
                 throw new Error(\`Batch Insert Failed: \${txt}\`);
            }

             log("✅ Proxy Pool Updated (Lightweight).");

             // 4. Maintain Elite Slots (Reuse connection logic)
             await maintainSlotsHTTP(DB_URL, DB_TOKEN, log);

        } catch (e) {
            error("Feeder Failed:", e.message);
            throw e;
        }
    }
};

async function maintainSlotsHTTP(dbUrl, dbToken, log) {
    const slots = ["ID_1", "ID_2", "ID_3", "SG_1", "SG_2", "SG_3"];
    const endpoint = \`\${dbUrl.replace("libsql://", "https://")}/v2/pipeline\`;

    // Run helper
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
                 const ipIdx = rs.response.result.cols.findIndex(c => c.name === "proxy_ip");
                 currentIp = rs.response.result.rows[0][ipIdx].value;
            }

            let needReplace = (currentIp === "0.0.0.0");
            
            // Check status of current assignment if not empty
            if (!needReplace) {
                 const poolCheck = await run("SELECT status FROM proxy_pool WHERE ip = ?", [currentIp]);
                 if (poolCheck.response.result.rows.length === 0) {
                     needReplace = true; // Not in pool (maybe purged)
                 } else {
                     const statusVal = poolCheck.response.result.rows[0][0].value;
                     if (statusVal === 'dead') needReplace = true;
                 }
            }

            if (needReplace) {
                 // REPLACEMENT STRATEGY: 
                 // We recently inserted fresh ID/SG proxies. Just pick one active one randomly.
                 const rep = await run(\`SELECT * FROM proxy_pool WHERE country = ? AND status = 'active' ORDER BY RANDOM() LIMIT 1\`, [countryTarget]);
                 
                 if (rep.response.result.rows.length > 0) {
                     const rCols = rep.response.result.cols;
                     const rRow = rep.response.result.rows[0];
                     
                     const getVal = (name) => rRow[rCols.findIndex(c => c.name === name)].value;
                     
                     const newIp = getVal("ip");
                     const newPort = getVal("port");
                     const newOrg = getVal("org");

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
