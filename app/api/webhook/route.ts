import { Bot, webhookCallback } from "grammy";
import { setupCommands } from "@/lib/telegram/commands";

export const dynamic = "force-dynamic";

let bot: Bot | null = null;

function getBot() {
    if (bot) return bot;
    const token = process.env.BOT_TOKEN;
    if (!token) {
        throw new Error("BOT_TOKEN is restricted/missing");
    }
    bot = new Bot(token);
    setupCommands(bot);
    return bot;
}

export async function POST(req: Request) {
    try {
        const botInstance = getBot();
        return webhookCallback(botInstance, "std/http")(req);
    } catch (e: any) {
        console.error("Webhook Error:", e);
        return new Response(`Error: ${e.message}`, { status: 500 });
    }
}

// Simple GET for checking status
// Diagnostic GET endpoint
export async function GET() {
    try {
        const token = process.env.BOT_TOKEN;
        if (!token) return new Response("Error: BOT_TOKEN missing in Env.", { status: 500 });

        // Try initializing
        const botInstance = getBot();
        const botInfo = await botInstance.api.getMe();

        return new Response(JSON.stringify({
            status: "ok",
            message: "Nautica Bot is Running!",
            bot: botInfo.username,
            db_status: process.env.TURSO_DATABASE_URL ? "configured" : "missing_url"
        }, null, 2), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
        return new Response(`Diagnostic Error: ${e.message}\nStack: ${e.stack}`, { status: 500 });
    }
}
