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
    { ip: "103.175.219.100", port: 443, country: "ID", org: "Nautica-ID1" },
    { ip: "103.186.0.0", port: 443, country: "ID", org: "Nautica-ID2" },
    { ip: "103.126.226.0", port: 80, country: "ID", org: "Nautica-ID3" },
    { ip: "103.116.168.0", port: 443, country: "ID", org: "Nautica-ID4" },
    { ip: "116.206.196.0", port: 443, country: "ID", org: "Nautica-ID5" },

    // 5 SINGAPORE SERVERS
    { ip: "178.128.0.0", port: 443, country: "SG", org: "Nautica-SG1" },
    { ip: "128.199.0.0", port: 443, country: "SG", org: "Nautica-SG2" },
    { ip: "167.172.0.0", port: 443, country: "SG", org: "Nautica-SG3" },
    { ip: "159.89.0.0", port: 443, country: "SG", org: "Nautica-SG4" },
    { ip: "139.59.0.0", port: 443, country: "SG", org: "Nautica-SG5" },
];

export class NauticaVPN {
    private static instance: NauticaVPN;
    private cachedProxies: ProxyItem[] = [];
    private wildcards: string[] = ["bug.com", "quiz.vidio.com", "cdn.discordapp.com"]; // Default wildcards

    private constructor() {
        this.cachedProxies = [...STATIC_PROXIES]; // Load static proxies
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

    // Fetch proxies (Static implementation)
    public async getProxies(countryCode?: string): Promise<ProxyItem[]> {
        let proxies = this.cachedProxies;
        if (countryCode) {
            // Support comma separated
            const codes = countryCode.toUpperCase().split(",");
            proxies = proxies.filter(p => codes.includes(p.country));
        }
        return shuffleArray(proxies);
    }

    // Helper to get top proxies (returns filtered static list)
    public async getTopProxies(refresh: boolean = false): Promise<ProxyItem[]> {
        // Since we use static, refresh doesn't mean much, just re-shuffle
        return this.getProxies();
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
