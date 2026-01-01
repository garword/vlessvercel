
import { NauticaVPN } from "../lib/vpn/nautica";

async function main() {
    console.log("Starting Proxy Fetch Test...");
    const start = Date.now();
    const vpn = NauticaVPN.getInstance();

    try {
        console.log("Calling getProxies()...");
        const proxies = await vpn.getProxies();
        const duration = Date.now() - start;

        console.log(`Fetch completed in ${duration}ms`);
        console.log(`Got ${proxies.length} proxies.`);
        if (proxies.length > 0) {
            console.log("Sample:", proxies[0]);
        }
    } catch (error) {
        console.error("Test Failed:", error);
    }
}

main();
