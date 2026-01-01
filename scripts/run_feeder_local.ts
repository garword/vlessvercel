
import worker from "./feeder_worker";

const env = {
    TURSO_DATABASE_URL: "libsql://vlesskuy-vlesskuyu.aws-ap-northeast-1.turso.io",
    TURSO_AUTH_TOKEN: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjcyNTE1OTgsImlkIjoiYzAxYzAwYjYtY2Q1My00NmQ0LWE4MjAtZTkzZGVhODg3YjVmIiwicmlkIjoiNTNlNTBkODItNzlhZi00ZmE4LTliODctMzRiMDJjNzEzODM1In0.d6ozCTxASOGn_eKIWlMM6wGQqej84RCWi_C_mdZnlsJJwM4pAZqC3c6SZVxisN1vcKQAxvMHQOXa6i3jfD_NCQ",
    GITHUB_PROXY_URL: "https://raw.githubusercontent.com/FoolVPN-ID/Nautica/main/proxyList.txt"
};

async function main() {
    console.log("🚀 Running Feeder Worker Simulation...");
    // Mock ScheduledEvent and ExecutionContext
    await worker.scheduled({ cron: "* * * * *", type: "scheduled", scheduledTime: Date.now() } as any, env, { waitUntil: (p: Promise<any>) => p, passThroughOnException: () => { } } as any);
    console.log("✅ Simulation Complete.");
}

main();
