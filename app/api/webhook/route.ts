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
export async function GET() {
    return new Response("Nautica Bot (Vercel Edition) is Running!", { status: 200 });
}
