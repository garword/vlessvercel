import { connect } from 'cloudflare:sockets';

export const FEEDER_SCRIPT = `
/**
 * Cloudflare Worker: Feeder & Rotator (Smart Logic)
 * Features:
 * - Smart Retention: Keeps alive proxies (Ping Check).
 * - Health Check: Verifies new candidates before inserting.
 * - Optimized: Low DB load, High Quality List.
 */
import { connect } from 'cloudflare:sockets';

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
                return new Response(\`✅ Feeder Finished (Smart Mode).\\n\\nLogs:\\n\${logs.join("\\n")}\`, { status: 200 });
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
        log("⏰ Starting Smart Proxy Update...");

        // Config
        const DB_URL = env.TURSO_DATABASE_URL;
        const DB_TOKEN = env.TURSO_AUTH_TOKEN;

        // --- HEALTH CHECK HELPER ---
        async function checkProxy(ip, port) {
            try {
                const socket = connect({ hostname: ip, port: port });
                const writer = socket.writable.getWriter();
                await writer.ready;
                await writer.close();
                socket.close();
                return true; // Connected
            } catch (e) {
                return false; // Connection Refused/Timeout
            }
        }
        
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
                headers: { "Authorization": \`Bearer \${DB_TOKEN}\`, "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            if (!resp.ok) {
                const txt = await resp.text();
                throw new Error(\`Turso Error (\${resp.status}): \${txt}\`);
            }
            return await resp.json();
        }

        try {
            // 1. Fetch Fresh List
            const proxyUrl = env.GITHUB_PROXY_URL || "https://raw.githubusercontent.com/FoolVPN-ID/Nautica/main/proxyList.txt";
            log(\`Fetching Source: \${proxyUrl}\`);
            
            const resp = await fetch(proxyUrl);
            if (!resp.ok) throw new Error(\`Failed to fetch GitHub: \${resp.status}\`);
            const text = await resp.text();
            
            // Parse Memory
            const allProxies = [];
            const lines = text.split("\\n");
            for (const line of lines) {
                const parts = line.split(",");
                if (parts.length >= 4) {
                    const [ip, p, cc, org] = parts;
                    allProxies.push({ ip: ip.trim(), port: parseInt(p.trim()), country: cc.trim().toUpperCase(), org: org.trim() });
                }
            }
            log(\`📥 Source Count: \${allProxies.length}\`);

            // 2. Logic: Maintain Elite Slots (ID_1..3, SG_1..3)
            const slots = ["ID_1", "ID_2", "ID_3", "SG_1", "SG_2", "SG_3"];

            // Helper to run query via HTTP
            const run = async (sql, args=[]) => {
                 const r = await executeSql(sql, args);
                 return r.results[0];
            };

            for (const slotId of slots) {
                const countryTarget = slotId.startsWith("ID") ? "ID" : "SG";
                
                // Get Current Slot
                const rs = await run("SELECT * FROM active_nodes WHERE slot_id = ?", [slotId]);
                let currentIp = "0.0.0.0";
                
                if (rs.response.result.rows.length > 0) {
                     const cols = rs.response.result.cols;
                     currentIp = rs.response.result.rows[0][cols.findIndex(c => c.name === "proxy_ip")].value;
                     const currentPort = rs.response.result.rows[0][cols.findIndex(c => c.name === "proxy_port")].value;
                     
                     // CHECK 1: Is it still alive?
                     if (currentIp !== "0.0.0.0") {
                         log(\`🔍 Checking \${slotId} (\${currentIp})...\`);
                         const isAlive = await checkProxy(currentIp, Number(currentPort)); 
                         
                         if (isAlive) {
                             log(\`✅ \${slotId} is ALIVE. Keeping it.\`);
                             // Update timestamp only
                             await run("UPDATE proxy_pool SET last_updated = ? WHERE ip = ?", [new Date().toISOString(), currentIp]);
                             continue; // SKIP REPLACEMENT
                         } else {
                             log(\`❌ \${slotId} is DEAD/TIMEOUT. Replacing...\`);
                         }
                     }
                }

                // NEED REPLACEMENT
                // Filter fresh list by country
                const candidates = allProxies.filter(p => p.country === countryTarget);
                let foundNew = false;
                
                // Try up to 5 times to find a working one
                for (let i = 0; i < 10; i++) {
                    const candidate = candidates[Math.floor(Math.random() * candidates.length)];
                    if (!candidate) break;

                    // Avoid duplicate if possible (simple check against currentIp not needed as we know current is dead/empty)
                    
                    // CHECK 2: Is candidate alive?
                    log(\`TESTING Candidate: \${candidate.ip}...\`);
                    const isGood = await checkProxy(candidate.ip, candidate.port);
                    
                    if (isGood) {
                         foundNew = true;
                         // 1. Insert/Update into Pool
                         await run(\`INSERT INTO proxy_pool (ip, port, country, org, status, last_updated)
                               VALUES (?, ?, ?, ?, 'active', ?)
                               ON CONFLICT(ip) DO UPDATE SET
                               port=excluded.port, country=excluded.country, org=excluded.org, status='active', last_updated=excluded.last_updated\`,
                               [candidate.ip, candidate.port, candidate.country, candidate.org, new Date().toISOString()]);
                         
                         // 2. Assign to Slot
                         await run(\`UPDATE active_nodes SET proxy_ip = ?, proxy_port = ?, display_name = ? WHERE slot_id = ?\`,
                               [candidate.ip, candidate.port, candidate.org, slotId]);
                         
                         log(\`♻️ Swapped \${slotId} -> \${candidate.org} (\${candidate.ip})\`);
                         break; // Done with this slot
                    }
                }
                
                if (!foundNew) {
                    log(\`⚠️ Failed to find valid replacement for \${slotId} after retries.\`);
                }
            }

            log("✅ Smart Update Complete.");

        } catch (e) {
            error("Feeder Failed:", e.message);
            throw e;
        }
    }
};
\`;\n
