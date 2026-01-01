import { CONSTANTS } from "../utils/constants";
import { getFlagEmoji, uuidv4, shuffleArray } from "../utils/helpers";

export interface ProxyItem {
    ip: string;
    port: number;
    country: string;
    org: string;
}

const STATIC_PROXIES: ProxyItem[] = [
    // 5 INDONESIA SERVERS
    { ip: "103.175.219.100", port: 443, country: "ID", org: "Biznet Networks" },
    { ip: "103.186.0.0", port: 443, country: "ID", org: "Telkom Indonesia" },
    { ip: "103.126.226.0", port: 80, country: "ID", org: "Indosat Ooredoo" },
    { ip: "103.116.168.0", port: 443, country: "ID", org: "XL Axiata" },
    { ip: "116.206.196.0", port: 443, country: "ID", org: "Digital Ocean ID" },

    // 5 SINGAPORE SERVERS
    { ip: "178.128.0.0", port: 443, country: "SG", org: "Digital Ocean SG" },
    { ip: "128.199.0.0", port: 443, country: "SG", org: "Linode SG" },
    { ip: "167.172.0.0", port: 443, country: "SG", org: "Amazon AWS SG" },
    { ip: "159.89.0.0", port: 443, country: "SG", org: "Google Cloud SG" },
    { ip: "139.59.0.0", port: 443, country: "SG", org: "Alibaba Cloud SG" },
];


export class NauticaVPN {
    private static instance: NauticaVPN;
    private cachedProxies: ProxyItem[] = [];
    private wildcards: string[] = ["bug.com", "quiz.vidio.com", "cdn.discordapp.com"]; // Default wildcards
    private lastFetch: number = 0;
    private readonly PRX_BANK_URL = "https://raw.githubusercontent.com/FoolVPN-ID/Nautica/main/proxyList.txt";
    private readonly CACHE_TTL = 60 * 1000; // 1 Minute Cache

    private constructor() {
        this.cachedProxies = [...STATIC_PROXIES]; // Initial Static Load
    }

    public static getInstance(): NauticaVPN {
        if (!NauticaVPN.instance) {
            NauticaVPN.instance = new NauticaVPN();
        }
        return NauticaVPN.instance;
    }

    // Wildcard Management (In-Memory for Vercel/MVP)
    public async getWildcards(): Promise<string[]> {
        return this.wildcards;
    }

    public async addWildcard(domain: string): Promise<boolean> {
        if (this.wildcards.includes(domain)) return false;
        this.wildcards.push(domain);
        return true;
    }

    public async removeWildcard(domain: string): Promise<boolean> {
        const index = this.wildcards.indexOf(domain);
        if (index > -1) {
            this.wildcards.splice(index, 1);
            return true;
        }
        return false;
    }

    // Fetch Proxies from Remote
    private async fetchProxies(): Promise<void> {
        try {
            console.log("Fetching proxies from:", this.PRX_BANK_URL);

            // Hard Timeout using Promise.race (5s) to guarantee fallback
            const fetchPromise = fetch(this.PRX_BANK_URL);
            const timeoutPromise = new Promise<Response>((_, reject) =>
                setTimeout(() => reject(new Error("Fetch Timeout")), 5000)
            );

            const res = await Promise.race([fetchPromise, timeoutPromise]);

            if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

            const text = await res.text();
            const lines = text.split("\n").filter(l => l.trim().length > 0);
            const newProxies: ProxyItem[] = [];

            for (const line of lines) {
                // Format: IP,Port,CC,Org
                const parts = line.split(",");
                if (parts.length >= 4) {
                    const [ip, portStr, country, org] = parts;
                    const port = parseInt(portStr.trim());
                    if (!isNaN(port)) {
                        newProxies.push({
                            ip: ip.trim(),
                            port: port,
                            country: country.trim().toUpperCase(),
                            org: org.trim()
                        });
                    }
                }
            }

            if (newProxies.length > 0) {
                this.cachedProxies = newProxies;
                this.lastFetch = Date.now();
                console.log(`Fetched ${newProxies.length} proxies.`);
            }
        } catch (error) {
            console.error("Failed to fetch proxies, using cache/static:", error);
            // If fetch fails and no cache, ensure we have static
            if (this.cachedProxies.length === 0) {
                this.cachedProxies = [...STATIC_PROXIES];
            }
        }
    }

    // Proxy Management
    public async addProxy(proxy: ProxyItem): Promise<boolean> {
        // Force Ensure Loaded
        if (this.cachedProxies.length === 0) this.cachedProxies = [...STATIC_PROXIES];

        // Check duplicate IP
        if (this.cachedProxies.some(p => p.ip === proxy.ip && p.port === proxy.port)) {
            return false;
        }
        this.cachedProxies.push(proxy);
        return true;
    }

    public async removeProxy(ip: string): Promise<boolean> {
        const initialLength = this.cachedProxies.length;
        this.cachedProxies = this.cachedProxies.filter(p => p.ip !== ip);
        return this.cachedProxies.length < initialLength;
    }

    public async clearDeadProxies(): Promise<number> {
        // In real app, check ping. Here we just pretend all static are alive.
        return 0;
    }

    // Fetch proxies (Dynamic Implementation)
    public async getProxies(countryCode?: string): Promise<ProxyItem[]> {
        // Check Cache
        if (Date.now() - this.lastFetch > this.CACHE_TTL || this.cachedProxies.length === 0) {
            await this.fetchProxies();
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

    // Helper to get top proxies (returns filtered static list)
    public async getTopProxies(refresh: boolean = false): Promise<ProxyItem[]> {
        if (refresh || Date.now() - this.lastFetch > this.CACHE_TTL) {
            await this.fetchProxies();
        }

        // Filter ONLY 3 ID and 3 SG
        const idProxies = this.cachedProxies.filter(p => p.country === "ID").slice(0, 3);
        const sgProxies = this.cachedProxies.filter(p => p.country === "SG").slice(0, 3);

        // Combine (ID first, then SG)
        const combined = [...idProxies, ...sgProxies];

        // Validation: If not enough, try to fill? No, strictly what's available.
        return combined;
    }


    // Generate VLESS Link
    public generateVless(proxy: ProxyItem, domain: string = "example.com", uuid: string = "", bugHost?: string): string {
        if (!uuid) uuid = uuidv4();

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
    public generateTrojan(proxy: ProxyItem, domain: string = "example.com", uuid: string = "", bugHost?: string): string {
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
    public generateVmess(proxy: ProxyItem, domain: string = "example.com", uuid: string = "", bugHost?: string): string {
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
    public async checkHealth(ip: string, port: number): Promise<any> {
        return { status: "up" }; // Always true for static
    }
}
