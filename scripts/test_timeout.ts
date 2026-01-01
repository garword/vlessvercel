
import { NauticaVPN } from "../lib/vpn/nautica";

// Mock global fetch to simulate timeout
const originalFetch = global.fetch;

async function testTimeoutFallback() {
    console.log("🧪 Testing Fetch Timeout Fallback...");

    // 1. Mock Fetch to Hang Forever
    global.fetch = async () => {
        console.log("   -> Mock Fetch Called (Will Hang 10s)...");
        await new Promise(resolve => setTimeout(resolve, 10000));
        return new Response("ok");
    };

    const vpn = NauticaVPN.getInstance();
    const start = Date.now();

    try {
        console.log("   -> Calling getProxies()...");
        const proxies = await vpn.getProxies(); // Should timeout in 5s
        const duration = Date.now() - start;

        console.log(`   -> Finished in ${duration}ms`);
        console.log(`   -> Proxies Returned: ${proxies.length}`);

        if (duration < 6000 && proxies.length > 0) {
            console.log("✅ SUCCESS: Timeout worked and Static Fallback used.");
        } else {
            console.error("❌ FAILURE: Too slow or no proxies returned.");
        }

    } catch (e) {
        console.error("❌ FAILURE: Exception thrown instead of fallback:", e);
    } finally {
        global.fetch = originalFetch; // Restore
    }
}

testTimeoutFallback();
