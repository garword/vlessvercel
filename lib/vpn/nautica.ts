import { CONSTANTS } from "../utils/constants";
import { getFlagEmoji, uuidv4, shuffleArray } from "../utils/helpers";
import { createClient } from "@libsql/client";

export interface ProxyItem {
    ip: string;
    port: number;
    country: string;
    org: string;
}

    // TURSO DB Integration
    private dbClient: any = null;
    private readonly DB_CACHE_TTL = 60 * 1000; // 1 Minute Cache (Faster updates for user)

    private constructor() {
    // Initialize Turso
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (url && authToken) {
        try {
            // Dynamically import or require to avoid build issues if package missing in some envs
            this.dbClient = createClient({ url, authToken });
            console.log("✅ NauticaVPN connected to Turso DB.");
        } catch (e) {
            console.error("❌ Failed to init Turso client:", e);
        }
    } else {
        console.warn("⚠️ TURSO_DATABASE_URL or TURSO_AUTH_TOKEN missing.");
    }

    // Initial Static Load -> DEPRECATED (Empty by default)
    this.cachedProxies = [];

    // Proactive Fetch on Init (Fire & Forget)
    if (this.dbClient) {
        this.fetchFromDB().catch(console.error);
    }
}

    public static getInstance(): NauticaVPN {
    if (!NauticaVPN.instance) {
        NauticaVPN.instance = new NauticaVPN();
    }
    return NauticaVPN.instance;
}

    // Wildcard Management (In-Memory for Vercel/MVP)
    public async getWildcards(): Promise < string[] > {
    return this.wildcards;
}

    public async addWildcard(domain: string): Promise < boolean > {
    if(this.wildcards.includes(domain)) return false;
    this.wildcards.push(domain);
    return true;
}

    public async removeWildcard(domain: string): Promise < boolean > {
    const index = this.wildcards.indexOf(domain);
    if(index > -1) {
    this.wildcards.splice(index, 1);
    return true;
}
return false;
    }

    // Fetch "Elite 6" from Turso
    private async fetchFromDB(): Promise < void> {
    if(!this.dbClient) return;

    try {
        const rs = await this.dbClient.execute("SELECT * FROM active_nodes ORDER BY slot_id");
        if(rs.rows.length > 0) {
    const dbProxies: ProxyItem[] = rs.rows.map((row: any) => ({
        ip: row.proxy_ip,
        port: row.proxy_port,
        country: row.slot_id.startsWith("ID") ? "ID" : "SG",
        org: row.display_name // STRICT: Use exact name from DB (which comes from GitHub Org)
    }));

    this.cachedProxies = dbProxies;
    this.lastFetch = Date.now();
    console.log(`Fetched ${dbProxies.length} Elite Nodes from Turso.`);
}
        } catch (e) {
    console.error("Turso Fetch Error:", e);
}
    }

    // Proxy Management
    public async addProxy(proxy: ProxyItem): Promise < boolean > {
    // Force Ensure Loaded
    if(this.cachedProxies.length === 0) this.cachedProxies = [];

    // Check duplicate IP
    if(this.cachedProxies.some(p => p.ip === proxy.ip && p.port === proxy.port)) {
    return false;
}
this.cachedProxies.push(proxy);
return true;
    }

    public async removeProxy(ip: string): Promise < boolean > {
    const initialLength = this.cachedProxies.length;
    this.cachedProxies = this.cachedProxies.filter(p => p.ip !== ip);
    return this.cachedProxies.length < initialLength;
}

    public async clearDeadProxies(): Promise < number > {
    // In real app, check ping. Here we just pretend all static are alive.
    return 0;
}

    // Get Active Proxies (Strict 6 from DB)
    public async getProxies(countryCode ?: string): Promise < ProxyItem[] > {
    // Stale-While-Revalidate Strategy
    // Return existing cache immediately, but trigger update if stale.
    if(this.dbClient && (Date.now() - this.lastFetch > this.DB_CACHE_TTL)) {
    console.log("Cache Stale: Triggering Background Refresh (Non-Blocking)");
    this.fetchFromDB().catch(e => console.error("BG Fetch Error:", e));
}

let proxies = this.cachedProxies;
if (countryCode) {
    if (countryCode === "RANDOM") return shuffleArray(proxies); // Special case

    // Support comma separated
    const codes = countryCode.toUpperCase().split(",");
    proxies = proxies.filter(p => codes.includes(p.country));
}
return shuffleArray(proxies);
    }

    // Helper to get top proxies (returns strictly the 6 elite nodes)
    public async getTopProxies(refresh: boolean = false): Promise < ProxyItem[] > {
    // If 'refresh' is forced, we await. Otherwise we capitalize on cache.
    if(refresh) {
        await this.fetchFromDB();
    } else if(this.dbClient && Date.now() - this.lastFetch > this.DB_CACHE_TTL) {
    this.fetchFromDB().catch(console.error);
}

// Return exactly what is in cache (which should be the 6 elite nodes from DB)
// Sort by Country        // Filter ONLY 3 ID and 3 SG (STRICT LIMIT for Fallback too)
const idProxies = this.cachedProxies.filter(p => p.country === "ID").slice(0, 3);
const sgProxies = this.cachedProxies.filter(p => p.country === "SG").slice(0, 3);
return [...idProxies, ...sgProxies];
    }


    // Generate VLESS Link
    public generateVless(proxy: ProxyItem, domain: string = "nautica.foolvpn.me", uuid: string = "", bugHost ?: string, workerDomain ?: string): string {
    if (!uuid) uuid = uuidv4();
    if (workerDomain) domain = workerDomain; // Override with Dynamic Domain

    const address = bugHost || domain;
    const sni = bugHost ? `${bugHost}.${domain}` : domain;

    // Nautica specific formatting for path
    const path = `/${proxy.ip}-${proxy.port}`;
    const name = `${getFlagEmoji(proxy.country)} ${proxy.country} ${proxy.org}`;

    const params = new URLSearchParams({
        encryption: "none",
        security: "tls", // Force TLS for wildcard logic usually
        type: "ws",
        host: sni,
        path: path,
        sni: sni
    });

    // Standardize: If no bugHost, follow port logic. If bugHost, usually port 443/TLS.
    if (!bugHost && proxy.port !== 443) {
        params.set("security", "none");
        params.delete("sni");
    }

    return `vless://${uuid}@${address}:${443}?${params.toString()}#${encodeURIComponent(name)}`;
}

    // Generate Trojan Link
    public generateTrojan(proxy: ProxyItem, domain: string = "nautica.foolvpn.me", uuid: string = "", bugHost ?: string, workerDomain ?: string): string {
    if (workerDomain) domain = workerDomain; // Override
    const password = uuid || "trojan";

    const address = bugHost || domain;
    const sni = bugHost ? `${bugHost}.${domain}` : domain;

    const path = `/${proxy.ip}-${proxy.port}`;
    const name = `${getFlagEmoji(proxy.country)} ${proxy.country} ${proxy.org}`;

    const params = new URLSearchParams({
        security: "tls",
        type: "ws",
        host: sni,
        path: path,
        sni: sni
    });

    if (!bugHost && proxy.port !== 443) {
        params.set("security", "none");
        params.delete("sni");
    }

    return `trojan://${password}@${address}:${443}?${params.toString()}#${encodeURIComponent(name)}`;
}

    // Generate VMess Link (Base64 JSON)
    public generateVmess(proxy: ProxyItem, domain: string = "nautica.foolvpn.me", uuid: string = "", bugHost ?: string, workerDomain ?: string): string {
    if (workerDomain) domain = workerDomain; // Override
    if (!uuid) uuid = uuidv4();

    const address = bugHost || domain;
    const sni = bugHost ? `${bugHost}.${domain}` : domain;

    const path = `/${proxy.ip}-${proxy.port}`;
    const name = `${getFlagEmoji(proxy.country)} ${proxy.country} ${proxy.org}`;

    const vmessConfig = {
        v: "2",
        ps: name,
        add: address, // Address = Bug Host
        port: "443", // Always 443 for Wildcard/CF
        id: uuid,
        aid: "0",
        scy: "auto",
        net: "ws",
        type: "none",
        host: sni, // Host = Bug.Domain
        path: path,
        tls: "tls",
        sni: sni // SNI = Bug.Domain
    };

    if (!bugHost && proxy.port !== 443) {
        vmessConfig.port = proxy.port.toString();
        vmessConfig.tls = "";
        (vmessConfig as any).sni = undefined;
    }

    const base64Part = btoa(JSON.stringify(vmessConfig));
    return `vmess://${base64Part}`;
}

    // Get health check (Stub)
    public async checkHealth(ip: string, port: number): Promise < any > {
    return { status: "up" }; // Always true for static
}
}
