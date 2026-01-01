import { VPN_SCRIPT } from "../templates/worker_code";

export async function deployWorker(
    apiToken: string,
    accountId: string,
    workerName: string,
    scriptContent?: string // Optional: if provided, use this instead of default
): Promise<{ success: boolean; message: string; url?: string }> {
    try {
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`;

        // Include minimal metadata to ensure it uses the module format
        const metadata = {
            main_module: "index.js",
        };

        const formData = new FormData();
        formData.append("metadata", JSON.stringify(metadata));

        // Append the script content as index.js
        const code = scriptContent || VPN_SCRIPT;
        const scriptBlob = new Blob([code], { type: "application/javascript+module" });
        formData.append("index.js", scriptBlob, "index.js");

        const response = await fetch(url, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${apiToken}`,
            },
            body: formData,
        });

        const data: any = await response.json();

        if (data.success) {
            // After deploying script, we might need to enable the subdomain route if it's the first time?
            // Usually uploading the script is enough if the worker is new, it gets assigned name.subdomain.workers.dev

            // Note: The triggers/routes are separate, but default workers.dev is usually auto-enabled for new workers
            // if configured in the dashboard or via specific flag, but API put script might not auto-enable it.
            // Let's try to enable it via a separate call if needed, but for now let's return success.

            // Try to enable workers.dev route explicitly just in case
            await enableWorkersDev(apiToken, accountId, workerName);

            // Fetch subdomain to construct URL
            const subdomain = await getSubdomain(apiToken, accountId);
            const workerUrl = `https://${workerName}.${subdomain}.workers.dev`;

            return { success: true, message: "Deploy success!", url: workerUrl };
        } else {
            return {
                success: false,
                message: `Deploy failed: ${data.errors?.[0]?.message || JSON.stringify(data.errors)}`
            };
        }
    } catch (error: any) {
        return { success: false, message: `Error: ${error.message}` };
    }
}

async function getSubdomain(apiToken: string, accountId: string): Promise<string> {
    try {
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`;
        const response = await fetch(url, {
            headers: { "Authorization": `Bearer ${apiToken}` }
        });
        const data: any = await response.json();
        if (data.success) {
            return data.result.subdomain;
        }
    } catch (e) { }
    return "workers.dev"; // Fallback
}

async function enableWorkersDev(apiToken: string, accountId: string, workerName: string) {
    try {
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/subdomain`;
        await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ enabled: true })
        });
    } catch (e) { }
}

export async function createWorkerRoute(zoneId: string, apiToken: string, pattern: string, scriptName: string) {
    const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            pattern: pattern,
            script: scriptName
        })
    });

    if (!response.ok) {
        const err = await response.text();
        console.error("Route Creation Failed:", err);
    }
}

export async function putWorkerSecrets(accountId: string, apiToken: string, scriptName: string, secrets: Record<string, string>) {
    for (const [key, value] of Object.entries(secrets)) {
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/secrets`;
        await fetch(url, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${apiToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: key,
                text: value,
                type: "secret_text"
            })
        });
    }
}

export async function createCronTrigger(accountId: string, apiToken: string, scriptName: string, cron: string) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/schedules`;

    // Note: Cloudflare API for Cron Triggers is via "schedules" endpoint or updating script settings.
    // simpler method for single script: PUT /schedules

    await fetch(url, {
        method: "PUT",
        headers: {
            "Authorization": `Bearer ${apiToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify([
            { cron: cron }
        ])
    });
}
