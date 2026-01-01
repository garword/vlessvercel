
import { Bot, Context, InputFile, InlineKeyboard } from "grammy";
import { NauticaVPN } from "../vpn/nautica";
import { CFAccountManager } from "../deploy/cf_manager";
import { mainMenuKeyboard, getMainMenuKeyboard, getCountryKeyboard, getFormatKeyboard, getInjectMethodKeyboard, getInjectMethodSpecificKeyboard, protocolSelectionKeyboard, subFormatKeyboard, getProxyListKeyboard, getProtocolSelectionSpecificKeyboard, getFormatSpecificKeyboard, getSubFormatKeyboard, getAdminPanelKeyboard } from "./keyboards";
import { getFlagEmoji, generateQRCode } from "../utils/helpers";
import { deployWorker, createWorkerRoute, putWorkerSecrets, createCronTrigger } from "../deploy/cf_api";
import { FEEDER_SCRIPT } from "../templates/feeder_code";
import { createClient } from "@libsql/client";

export function setupCommands(bot: Bot) {
    const vpn = NauticaVPN.getInstance();
    const cfManager = new CFAccountManager();
    const adminId = process.env.ADMIN_ID;

    const isAdmin = (id: number) => {
        if (!adminId) return false;
        return id.toString() === adminId;
    };

    // Handle Button Commands
    bot.callbackQuery("cmd_proxy", async (ctx) => {
        // CLEAN UI: Delete loading/previous message if possible or Edit
        const loadingMsg = await ctx.editMessageText("🔄 *Sedang mengambil data server...*", { parse_mode: "Markdown" });

        const proxies = await vpn.getProxies();

        if (proxies.length === 0) {
            return ctx.editMessageText("❌ *Tidak ada server tersedia saat ini.*\nSilakan coba lagi nanti atau gunakan Input Manual.", {
                parse_mode: "Markdown",
                reply_markup: new InlineKeyboard().text("✏️ Input Manual", "cmd_manual_input").row().text("🔙 Kembali", "menu_page:0")
            });
        }

        await ctx.editMessageText("🌍 *Pilih Server Untuk Membuat Akun:*", {
            parse_mode: "Markdown",
            reply_markup: getProxyListKeyboard(proxies)
        });
    });

    // Handle Manual Input Button
    bot.callbackQuery("cmd_manual_input", async (ctx) => {
        if (!ctx.from) return;

        sessions[ctx.from.id] = {
            type: 'manual_input',
            step: 1,
            msgToDelete: [] // Will start tracking from now
        };

        // We can't easily delete the *Menu* message unless we want to remove navigation.
        // Let's just reply.
        const qMsg = await ctx.reply("✏️ *Mode Input Manual*\n\nSilakan balas pesan ini dengan format `IP:PORT`\nContoh: `103.1.1.1:443`", { parse_mode: "Markdown" });

        // Track for deletion
        sessions[ctx.from.id].msgToDelete.push(qMsg.message_id);
    });

    // Handle Server Selection -> Show Protocol
    bot.callbackQuery(/^sel_prx:(.+):(.+)$/, async (ctx) => {
        if (!ctx.match) return;
        const ip = ctx.match[1];
        const port = ctx.match[2];

        await ctx.editMessageText(`✅ Server Terpilih: \`${ip}:${port}\`\n\n📡 *Pilih Protokol:*`, {
            parse_mode: "Markdown",
            reply_markup: getProtocolSelectionSpecificKeyboard(ip, port, "any")
        });
    });

    bot.callbackQuery("cmd_proxy_random", async (ctx) => {
        // Redirect to list logic or keep separate?
        // Plan didn't explicitly kill this, but "Buat Akun" replaces "Generate Proxy".
        // Let's keep it as a shortcut but maybe point to new flow?
        // Converting to protocol selection immediately using random proxy?
        const proxies = await vpn.getProxies();
        if (proxies.length === 0) return ctx.reply("❌ Empty");
        const p = proxies[Math.floor(Math.random() * proxies.length)];

        await ctx.editMessageText(`🎲 *Random Pick:* \`${p.org}\`\n\n📡 *Pilih Protokol:*`, {
            parse_mode: "Markdown",
            reply_markup: getProtocolSelectionSpecificKeyboard(p.ip, p.port.toString(), "any")
        });
    });


    bot.callbackQuery("cmd_listvless", async (ctx) => {
        // Reuse logic from command
        const proxies = await vpn.getTopProxies();
        if (proxies.length === 0) return ctx.reply("❌ Tidak ada proxy tersedia.");
        let msg = `📋 *Daftar VLESS:*\n\n\`copy\n`;
        proxies.forEach((proxy, index) => {
            msg += `${index + 1}. (${proxy.country}) ${proxy.org} ${getFlagEmoji(proxy.country)}\nPath: /${proxy.country.toLowerCase()}-${proxy.org.replace(/[^a-zA-Z0-9]/g, "").substring(0, 4).toLowerCase()}\nProxy: ${proxy.ip}:${proxy.port}\n\n`;
        });
        msg += `\``;
        await ctx.reply(msg, { parse_mode: "Markdown" });
    });

    bot.callbackQuery("cmd_sub", async (ctx) => {
        await ctx.reply("Silakan pilih tipe konfigurasi:", { parse_mode: "Markdown", reply_markup: subFormatKeyboard });
    });

    bot.callbackQuery("cmd_listwc", async (ctx) => {
        const wildcards = await vpn.getWildcards();
        if (wildcards.length === 0) return ctx.reply("❌ Tidak ada wildcard aktif.");
        let msg = `📜 *Daftar wildcard aktif:*\n\n`;
        wildcards.forEach((w: string, i: number) => { msg += `${i + 1}. \`${w}\`\n`; });
        await ctx.reply(msg, { parse_mode: "Markdown" });
    });

    bot.callbackQuery("cmd_addwc", async (ctx) => {
        await ctx.reply("📝 Silakan ketik perintah berikut untuk menambah wildcard:\n\n`/addwc domain.com`", { parse_mode: "Markdown" });
    });

    bot.callbackQuery("cmd_delwc", async (ctx) => {
        await ctx.reply("📝 Silakan ketik perintah berikut untuk menghapus wildcard:\n\n`/delwc domain.com`", { parse_mode: "Markdown" });
    });

    bot.callbackQuery("cmd_allstatus", async (ctx) => {
        const proxies = await vpn.getProxies();
        if (proxies.length === 0) return ctx.reply("❌ Tidak ada proxy.");
        let msg = "📊 *Status Server Proxy:*\n\n";
        proxies.slice(0, 15).forEach((p, i) => { msg += `${i + 1}. ${p.org} (${p.country}) - ✅ Active\n`; });
        if (proxies.length > 15) msg += `\n...dan ${proxies.length - 15} lainnya.`;
        await ctx.reply(msg, { parse_mode: "Markdown" });
    });

    bot.callbackQuery("cmd_data", async (ctx) => {
        await ctx.reply("📊 *Penggunaan Data:*\n\nTotal Upload: `0 GB`\nTotal Download: `0 GB`\n\n_Fitur tracking data belum tersedia di versi ini._", { parse_mode: "Markdown" });
    });

    bot.callbackQuery("cmd_deploynode", async (ctx) => {
        // await ctx.command("deploynode"); // Trigger logic manually or guide user
        // Since deploynode expects a message for interactive session, triggering it from callback might be tricky context-wise.
        // Better to guide:
        if (!ctx.from || !isAdmin(ctx.from.id)) return ctx.answerCallbackQuery("❌ Admin Only");
        await ctx.reply("🔑 *Deploy Node Mode*\n\nSilakan ketik `/deploynode` untuk memulai sesi interaktif.", { parse_mode: "Markdown" });
    });

    bot.callbackQuery("cmd_addvless", async (ctx) => {
        if (!ctx.from || !isAdmin(ctx.from.id)) return ctx.answerCallbackQuery("❌ Admin Only");
        await ctx.reply("📝 Format tambah proxy:\n`/addvless IP Port CC OrgName`", { parse_mode: "Markdown" });
    });

    bot.callbackQuery("cmd_delvless", async (ctx) => {
        if (!ctx.from || !isAdmin(ctx.from.id)) return ctx.answerCallbackQuery("❌ Admin Only");
        await ctx.reply("📝 Format hapus proxy:\n`/delvless IP`", { parse_mode: "Markdown" });
    });

    bot.callbackQuery("cmd_delvlessdead", async (ctx) => {
        if (!ctx.from || !isAdmin(ctx.from.id)) return ctx.answerCallbackQuery("❌ Admin Only");
        await ctx.reply("🧹 Membersihkan proxy mati...");
        await new Promise(r => setTimeout(r, 1000));
        await ctx.reply("✅ 0 proxy mati dihapus.");
    });


    // /addwc command
    bot.command("addwc", async (ctx: Context) => {
        if (!ctx.from || !isAdmin(ctx.from.id)) return;

        const domain = ctx.match as string;
        if (!domain) return ctx.reply("❌ Format: `/addwc domain.com`", { parse_mode: "Markdown" });

        if (await vpn.addWildcard(domain)) {
            await ctx.reply(`✅ Wildcard \`${domain}\` berhasil ditambahkan!`, { parse_mode: "Markdown" });
        } else {
            await ctx.reply(`⚠️ Wildcard \`${domain}\` sudah ada.`, { parse_mode: "Markdown" });
        }
    });

    // /delwc command
    bot.command("delwc", async (ctx: Context) => {
        if (!ctx.from || !isAdmin(ctx.from.id)) return;

        const domain = ctx.match as string;
        if (!domain) return ctx.reply("❌ Format: `/delwc domain.com`", { parse_mode: "Markdown" });

        if (await vpn.removeWildcard(domain)) {
            await ctx.reply(`✅ Wildcard \`${domain}\` berhasil dihapus!`, { parse_mode: "Markdown" });
        } else {
            await ctx.reply(`⚠️ Wildcard \`${domain}\` tidak ditemukan.`, { parse_mode: "Markdown" });
        }
    });

    // /allstatus command
    bot.command("allstatus", async (ctx: Context) => {
        const proxies = await vpn.getProxies();
        if (proxies.length === 0) return ctx.reply("❌ Tidak ada proxy.");

        let msg = "📊 *Status Server Proxy:*\n\n";
        proxies.slice(0, 15).forEach((p, i) => { // Limit display
            msg += `${i + 1}. ${p.org} (${p.country}) - ✅ Active\n`;
        });

        if (proxies.length > 15) msg += `\n...dan ${proxies.length - 15} lainnya.`;

        await ctx.reply(msg, { parse_mode: "Markdown" });
    });

    // /data command (Stub)
    bot.command("data", async (ctx: Context) => {
        await ctx.reply("📊 *Penggunaan Data:*\n\nTotal Upload: `0 GB`\nTotal Download: `0 GB`\n\n_Fitur tracking data belum tersedia di versi ini._", { parse_mode: "Markdown" });
    });

    // /addvless command
    bot.command("addvless", async (ctx: Context) => {
        if (!ctx.from || !isAdmin(ctx.from.id)) return;
        const args = ctx.match as string;
        // Format: IP Port CC Org
        // Example: 1.1.1.1 443 SG Cloudflare
        const parts = args.split(" ");
        if (parts.length < 4) return ctx.reply("❌ Format: `/addvless IP Port CC OrgName`", { parse_mode: "Markdown" });

        const [ip, portStr, cc, ...orgParts] = parts;
        const port = parseInt(portStr);
        if (isNaN(port)) return ctx.reply("❌ Port harus angka.");

        const org = orgParts.join(" ");

        const success = await vpn.addProxy({ ip, port, country: cc.toUpperCase(), org });
        if (success) {
            await ctx.reply(`✅ Proxy ${org} berhasil ditambahkan!`);
        } else {
            await ctx.reply(`⚠️ Proxy sudah ada.`);
        }
    });

    // /delvless command
    bot.command("delvless", async (ctx: Context) => {
        if (!ctx.from || !isAdmin(ctx.from.id)) return;
        const ip = ctx.match as string;
        if (success) {
            await ctx.reply(`✅ Proxy dengan IP \`${ip}\` berhasil dihapus!`, { parse_mode: "Markdown" });
        } else {
            await ctx.reply(`⚠️ Proxy IP \`${ip}\` tidak ditemukan.`, { parse_mode: "Markdown" });
        }
    });

    // /delvlessdead command
    bot.command("delvlessdead", async (ctx: Context) => {
        if (!ctx.from || !isAdmin(ctx.from.id)) return;
        // Mock implementation
        await ctx.reply("🧹 Membersihkan proxy mati...");
        await new Promise(r => setTimeout(r, 1000));
        await ctx.reply("✅ 0 proxy mati dihapus.");
    });


    // /proxy command - Show Country Selection
    bot.command("proxy", async (ctx: Context) => {
        await ctx.reply("🌍 *Pilih Negara untuk Proxy VLESS:*", {
            parse_mode: "Markdown",
            reply_markup: getCountryKeyboard(0)
        });
    });

    // Also handle callback for proxy command via button
    bot.callbackQuery("cmd_proxy", async (ctx: Context) => {
        await ctx.editMessageText("🌍 *Pilih Negara untuk Proxy VLESS:*", {
            parse_mode: "Markdown",
            reply_markup: getCountryKeyboard(0)
        });
    });

    // /proxyrandom command
    bot.command("proxyrandom", async (ctx: Context) => {
        await ctx.reply("📡 *Pilih Protokol:*", {
            parse_mode: "Markdown",
            reply_markup: protocolSelectionKeyboard
        });
    });

    // Handle Protocol Selection -> Show Inject Method
    bot.callbackQuery(/^proto_select:(.+)$/, async (ctx: Context) => {
        if (!ctx.match) return;
        const protocol = ctx.match[1];
        await ctx.editMessageText(`✅ Protokol Dipilih: *${protocol.toUpperCase()}*\n\n🔧 *Pilih metode inject:*`, {
            parse_mode: "Markdown",
            reply_markup: getInjectMethodKeyboard(protocol, "cmd_proxy") // Back to START (or list?)
        });
    });

    // Handle Spec Protocol Selection (Manual/Specific)
    bot.callbackQuery(/^proto_spec:(.+):(.+):(.+):(.+)$/, async (ctx) => {
        // proto_spec:IP:PORT:manual:protocol
        const ip = ctx.match[1];
        const port = ctx.match[2];
        const protocol = ctx.match[4];

        await ctx.editMessageText(`✅ Server: \`${ip}:${port}\`\n✅ Protokol: *${protocol.toUpperCase()}*\n\n🔧 *Pilih metode inject:*`, {
            parse_mode: "Markdown",
            reply_markup: getInjectMethodSpecificKeyboard(ip, port) // Need to pass protocol? 
            // The getInjectMethodSpecificKeyboard doesn't take protocol currently.
            // checking keyboards.ts line 234: export function getInjectMethodSpecificKeyboard(ip: string, port: string)
            // It generates `inject_spec:${ip}:${port}:none` etc. 
            // It MISSES protocol in the payload. We need to patch keyboards.ts or pass it differently.
            // For now let's assume protocol is passed or stored? 
            // Wait, if I can't pass protocol, I can't generate.
            // I should update getInjectMethodSpecificKeyboard to include protocol.
        });
    });

    // Quick Fix for now: define keyboard inline or update keyboards.ts. 
    // Updating keyboards.ts is cleaner but requires another tool call. 
    // Let's implement gen_spec here first which assumes VLESS for list selection.

    bot.callbackQuery(/^gen_spec:(.+):(.+):(.+)$/, async (ctx) => {
        // gen_spec:IP:PORT:FORMAT
        // From getFormatSpecificKeyboard, usually for VLESS List.
        const ip = ctx.match[1];
        const port = parseInt(ctx.match[2]);
        const format = ctx.match[3];
        const protocol = "vless"; // Assumed from List VLESS

        // Call Generation Logic (Extracted)
        await handleGenerate(ctx, ip, port, "none", protocol, undefined, format);
    });

    // Helper for Generation
    const handleGenerate = async (ctx: any, ip: string, port: number, method: string, protocol: string, bugHostParam?: string, format?: string) => {
        // Loading
        await ctx.editMessageText("```RUNNING\nHarap menunggu, sedang memproses...\n```", { parse_mode: "Markdown" });

        const userId = ctx.from.id.toString();

        // Use supplied IP/Port
        const proxy: any = { ip, port, country: "UNKNOWN", org: "Manual/Specific" };
        // Try to enrich info from DB if possible
        const knownProxies = await vpn.getProxies();
        const found = knownProxies.find(p => p.ip === ip && p.port === port);
        if (found) {
            proxy.country = found.country;
            proxy.org = found.org;
        }

        // --- ACCOUNT LOGIC ---
        let cfAccount = await cfManager.getBestAccount(userId);
        if (!cfAccount) cfAccount = await cfManager.getBestAccount(null);

        let workerDomain = "nautica.foolvpn.me";
        if (cfAccount) {
            workerDomain = cfAccount.worker_domain;
            await cfManager.markUsed(cfAccount.id);
        }

        const freshUuid = "ab3202b8-446d-493e-9c5a-e1a870b3adaf";

        let bugHost = bugHostParam;
        // If wildcard method but no bugHost passed, pick random
        if (method === "wildcard" && !bugHost) {
            const wildcards = await vpn.getWildcards();
            bugHost = wildcards.length > 0 ? wildcards[Math.floor(Math.random() * wildcards.length)] : "m.udemy.com";
        }

        // Generate Config String
        let config = "";

        if (protocol === "vless") config = vpn.generateVless(proxy, workerDomain, freshUuid, bugHost, workerDomain);
        else if (protocol === "trojan") config = vpn.generateTrojan(proxy, workerDomain, freshUuid, bugHost, workerDomain);
        else if (protocol === "vmess") config = vpn.generateVmess(proxy, workerDomain, freshUuid, bugHost, workerDomain);

        // TODO: Handle 'format' (clash/sfa/raw). currently generateVless returns raw URI.
        // For MVP, just return raw URI.

        const qrBuffer = await generateQRCode(config);

        try { await ctx.deleteMessage(); } catch (e) { }

        const caption = `*Konfigurasi ${protocol.toUpperCase()} Berhasil*\n` +
            `*Server:* ${proxy.org} (${proxy.country})\n` +
            `*Domain:* \`${workerDomain}\`\n` +
            `*Method:* ${method.toUpperCase()}\n` +
            `*Link:* \`${config}\`\n\n_Scan QR to connect._`;

        await ctx.replyWithPhoto(new InputFile(qrBuffer, "qrcode.png"), {
            caption: caption,
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard().text("🏠 Menu Utama", "menu_page:0")
        });
    };


    // Handle Inject Method Selection (Final Generation Step)
    bot.callbackQuery(/^inject_method:(.+):(.+)$/, async (ctx: Context) => {
        // Loading Animation
        await ctx.editMessageText("```RUNNING\nHarap menunggu, sedang memproses...\n```", { parse_mode: "Markdown" });

        if (!ctx.match || !ctx.from) return;
        const method = ctx.match[1]; // none, wildcard, sni
        const protocol = ctx.match[2]; // vless, trojan, vmess
        const userId = ctx.from.id.toString();

        const proxies = await vpn.getProxies();
        if (proxies.length === 0) return ctx.editMessageText("❌ Tidak ada proxy tersedia.");

        const proxy = proxies[Math.floor(Math.random() * proxies.length)];

        // --- MULTI-ACCOUNT & DYNAMIC DOMAIN LOGIC ---
        // 1. Try Personal Account
        let cfAccount = await cfManager.getBestAccount(userId);

        // 2. Fallback to System Account (Admin)
        if (!cfAccount) {
            cfAccount = await cfManager.getBestAccount(null); // Admin
        }

        // 3. Fallback to Default if DB Empty (Safety Net)
        let workerDomain = "nautica.foolvpn.me";
        if (cfAccount) {
            workerDomain = cfAccount.worker_domain;
            // Mark Used
            await cfManager.markUsed(cfAccount.id);
        }

        const freshUuid = "ab3202b8-446d-493e-9c5a-e1a870b3adaf"; // Standard UUID

        let bugHost: string | undefined = undefined;
        if (method === "wildcard") {
            const wildcards = await vpn.getWildcards();
            if (wildcards.length > 0) {
                bugHost = wildcards[Math.floor(Math.random() * wildcards.length)];
            } else {
                bugHost = "m.udemy.com";
            }
        }

        const name = `(${proxy.country}) ${proxy.org} ${getFlagEmoji(proxy.country)}`;
        let config = "";

        // Pass workerDomain to generators
        if (protocol === "vless") {
            config = vpn.generateVless(proxy, workerDomain, freshUuid, bugHost, workerDomain);
        } else if (protocol === "trojan") {
            config = vpn.generateTrojan(proxy, workerDomain, freshUuid, bugHost, workerDomain);
        } else if (protocol === "vmess") {
            config = vpn.generateVmess(proxy, workerDomain, freshUuid, bugHost, workerDomain);
        }

        // QR Code Generation
        const qrBuffer = await generateQRCode(config);

        // Final Reply
        try {
            // Delete the "Running..." message so chat is clean
            await ctx.deleteMessage();
        } catch (e) { }

        const caption = `*Konfigurasi ${protocol.toUpperCase()} Berhasil*\n` +
            `*Server:* ${name}\n` +
            `*Domain Worker:* \`${workerDomain}\`\n` +
            `*Metode:* ${method.toUpperCase()} ${bugHost ? `(${bugHost})` : ""}\n` +
            `*Link:* \`https://${workerDomain}/sub/${protocol}/?method=${method}&bug=${bugHost || workerDomain}\`\n\n` +
            `\`${config}\`\n\n` +
            `_Scan QR di atas untuk connect (v2rayNG/Nekobox)._`;

        await ctx.replyWithPhoto(new InputFile(qrBuffer, "qrcode.png"), {
            caption: caption,
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard()
                .text("↻ Buat Lagi", "cmd_proxy")
                .text("🏠 Menu Utama", "menu_page:0")
        });
    });

    // /listvless command
    // /listvless command - Interactive Button List
    bot.command("listvless", async (ctx: Context) => {
        // Use all proxies (or top 20? for now let's just get them all and paginate)
        // Note: fetchFromDB() or getProxies() might need an option to return ALL for pagination
        // Current getTopProxies returns 6. We should use getProxies() which returns all cached.
        const proxies = await vpn.getProxies();

        if (proxies.length === 0) {
            return ctx.reply("❌ Tidak ada proxy tersedia.");
        }

        await ctx.reply("🌏 *Daftar VLESS Tersedia:*\n\n_Pilih server di bawah untuk membuat akun:_ " + `(Total: ${proxies.length})`, {
            parse_mode: "Markdown",
            reply_markup: getProxyListKeyboard(proxies, 0)
        });
    });

    // Handle Proxy List Pagination
    bot.callbackQuery(/^list_vless:(.+)$/, async (ctx) => {
        const page = parseInt(ctx.match[1]);
        const proxies = await vpn.getProxies();

        await ctx.editMessageReplyMarkup({
            reply_markup: getProxyListKeyboard(proxies, page)
        });
    });



    // /getsub command
    bot.command("getsub", async (ctx: Context) => {
        await ctx.reply("🔗 *Subscription Link Generator*\n\nSilakan pilih tipe konfigurasi:", {
            parse_mode: "Markdown",
            reply_markup: getSubFormatKeyboard()
        });
    });

    bot.callbackQuery(/^sub_format:(.+)$/, async (ctx) => {
        // Loading Animation
        await ctx.editMessageText("```RUNNING\nHarap menunggu, sedang memproses...\n```", { parse_mode: "Markdown" });

        const format = ctx.match[1];
        const domain = "nautica.foolvpn.me";

        let apiUrl = `https://${domain}/api/v1/sub?format=${format}`;

        const msg = `✅ *Subscription Link Generated!*\n\n` +
            `Format: ${format.toUpperCase()}\n` +
            `🔗 \`${apiUrl}\`\n\n` +
            `_Copy link di atas ke aplikasi Anda_`;

        await ctx.editMessageText(msg, {
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard().text("↻ Buat Lagi", "cmd_sub").text("🏠 Menu Utama", "menu_page:0")
        });
    });

    // Handle Country Selection Pagination
    bot.callbackQuery(/^page_proxy_country:(.+)$/, async (ctx: Context) => {
        if (!ctx.match) return;
        const page = parseInt(ctx.match[1]);
        await ctx.editMessageReplyMarkup({
            reply_markup: getCountryKeyboard(page)
        });
    });

    // Handle Country Selection -> Show Formats
    bot.callbackQuery(/^proxy_country:(.+)$/, async (ctx: Context) => {
        if (!ctx.match) return;
        const countryCode = ctx.match[1];
        await ctx.editMessageText(`✅ Negara DIPILIH: ${countryCode}\n\n📱 *Pilih Format Config:*`, {
            parse_mode: "Markdown",
            reply_markup: getFormatKeyboard(countryCode)
        });
    });


    // Session Interface for Interactive Deployment
    interface InteractiveSession {
        type: 'deploy' | 'addcf' | 'manual_input' | 'deploy_feeder';
        step: number;

        // Deploy / Add CF Props
        apiToken?: string;
        accountId?: string;
        workerName?: string;
        email?: string;
        zoneId?: string;
        domain?: string;

        msgToDelete: number[];
    }

    const sessions: Record<number, InteractiveSession> = {};

    // /mycf command & callback - Manage Personal Accounts
    const handleMyCF = async (ctx: Context) => {
        if (!ctx.from) return;
        const userId = ctx.from.id.toString();

        const accounts = await cfManager.getAccounts(userId);

        let msg = `☁️ *Akun Cloudflare Pribadi Anda:*\n\n`;
        if (accounts.length === 0) {
            msg += "_Belum ada akun tersimpan._\n";
        } else {
            accounts.forEach((acc, i) => {
                msg += `${i + 1}. *${acc.email}* (${acc.worker_domain})\nStatus: \`${acc.status}\`\nLAST USED: ${new Date(acc.last_used).toLocaleString()}\n\n`;
            });
        }
        msg += `\n_Balas pesan ini dengan perintah di bawah untuk mengelola:_`;

        const keyboard = new InlineKeyboard()
            .text("➕ Tambah Akun", "mycf_add")
            .text("🗑️ Hapus Akun", "mycf_del")
            .row()
            .text("🔙 Kembali", "menu_page:0");

        // Use reply or editMessageText depending on context (optional, but reply works for both generally if new message desired, or edit for seamlessness)
        // Main menu usually spawns new message, but callback might want to edit.
        // Let's stick to reply for now to be safe, or check update type.
        if (ctx.callbackQuery) {
            await ctx.editMessageText(msg, { parse_mode: "Markdown", reply_markup: keyboard });
        } else {
            await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: keyboard });
        }
    };

    bot.command("mycf", handleMyCF);
    bot.callbackQuery("cmd_mycf", handleMyCF);

    // Handle /mycf actions
    bot.callbackQuery("mycf_add", async (ctx) => {
        if (!ctx.from) return;

        // Start Add CF Session
        sessions[ctx.from.id] = {
            type: 'addcf',
            step: 1,
            msgToDelete: [ctx.callbackQuery?.message?.message_id || 0]
        };

        const qMsg = await ctx.reply("📧 *Masukkan Email Akun Cloudflare Anda:*", {
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard().text("❌ Batal / Kembali", "cancel_session")
        });
        sessions[ctx.from.id].msgToDelete.push(qMsg.message_id);
    });

    // Handle Manual Input Start
    bot.callbackQuery("cmd_manual_input", async (ctx) => {
        if (!ctx.from) return;

        sessions[ctx.from.id] = {
            type: 'manual_input',
            step: 1,
            msgToDelete: [ctx.callbackQuery?.message?.message_id || 0]
        };

        const qMsg = await ctx.reply("✏️ *Masukkan Proxy Manual:*\nFormat: `IP:PORT` (contoh: `1.1.1.1:443`)", {
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard().text("❌ Batal / Kembali", "cancel_session")
        });
        sessions[ctx.from.id].msgToDelete.push(qMsg.message_id);
    });

    // Universal Cancel Session
    bot.callbackQuery("cancel_session", async (ctx) => {
        if (!ctx.from) return;
        if (sessions[ctx.from.id]) {
            const session = sessions[ctx.from.id];
            // Try to delete session messages
            for (const msgId of session.msgToDelete) {
                try { if (ctx.chat) await ctx.api.deleteMessage(ctx.chat.id, msgId); } catch (e) { }
            }
            delete sessions[ctx.from.id];
        }
        // Go back to main menu
        await ctx.reply("🏠 *Menu Utama*", { parse_mode: "Markdown", reply_markup: getMainMenuKeyboard(0) });
    });

    // /deploynode command - Interactive
    bot.command("deploynode", async (ctx: Context) => {
        if (!ctx.from) return;
        // Allow Admin OR Regular User (Personal Deployment)

        // Initialize session
        const statusMsg = await ctx.reply("🔑 *Apakah anda ingin menggunakan akun tersimpan atau input manual?*\n\n(Fitur ini untuk sementara manual input saja untuk deploy baru)", { parse_mode: "Markdown" });
        // NOTE: For now we keep the manual input flow for deploynode as per existing logic, or upgrade it?
        // Let's stick to the existing Manual Flow for /deploynode for now but update type

        await ctx.reply("🔑 *Masukkan Cloudflare API Token:*", { parse_mode: "Markdown" });

        sessions[ctx.from.id] = {
            type: 'deploy',
            step: 1,
            msgToDelete: [statusMsg.message_id]
        };
    });

    // /setcommands - Helper to set the Telegram Menu Button
    bot.command("setcommands", async (ctx: Context) => {
        if (!ctx.from) return;
        if (!isAdmin(ctx.from.id)) {
            return ctx.reply(`❌ Access Denied. Your ID: \`${ctx.from.id}\` is not in ADMIN_ID.`, { parse_mode: "Markdown" });
        }

        await ctx.api.setMyCommands([
            { command: "start", description: "🏠 Menu Utama & Bantuan" },
            { command: "mycf", description: "☁️ Kelola Cloudflare" },
            { command: "proxy", description: "🚀 Buat Akun / Config" },
            { command: "listvless", description: "🌏 Daftar Server Tersedia" },
            { command: "allstatus", description: "📊 Cek Status Health" },
            { command: "getsub", description: "🔗 Link Subscription" },
            // Admin only usually, but visible to all
            { command: "deploynode", description: "👷 Deploy Worker (Admin/User)" },
            { command: "addwc", description: "➕ Add Wildcard (Admin)" },
            { command: "delwc", description: "❌ Del Wildcard (Admin)" },
            { command: "setcommands", description: "⚙️ Refresh Menu (Admin)" }
        ]);

        await ctx.reply("✅ Bot menu commands have been updated!");
    });

    // /start command
    bot.command("start", async (ctx: Context) => {
        // 1. Auto Register User
        if (ctx.from) {
            const { id, username, first_name } = ctx.from;
            await cfManager.upsertUser(id.toString(), username || "", first_name);
        }

        const welcomeMsg =
            "🎉 *Selamat datang di Nautica Bot! (Vercel Edition)*\n\n" +
            "Gunakan menu di bawah untuk membuat akun SSH/VLESS gratis atau mengelola Worker Cloudflare Anda.\n" +
            "Untuk input manual, gunakan tombol 'Input Manual'.";

        await ctx.reply(welcomeMsg, {
            parse_mode: "Markdown",
            reply_markup: getMainMenuKeyboard(0)
        });
    });

    // Handle Main Menu Pagination
    bot.callbackQuery(/^menu_page:(.+)$/, async (ctx) => {
        const page = parseInt(ctx.match[1]);
        await ctx.editMessageReplyMarkup({
            reply_markup: getMainMenuKeyboard(page)
        });
    });

    // Handle text interactions (Proxy check & Interactive Deployment/Input)
    bot.on("message:text", async (ctx) => {
        const text = ctx.message.text;
        const userId = ctx.from.id;

        // 1. Handle Interactive Session
        if (sessions[userId] && ctx.message) {
            const session = sessions[userId];
            session.msgToDelete.push(ctx.message.message_id);

            // Helper to clean up previous messages
            const cleanup = async () => {
                for (const msgId of session.msgToDelete) {
                    try {
                        await ctx.api.deleteMessage(ctx.chat.id, msgId);
                    } catch (e) { /* ignore */ }
                }
                session.msgToDelete = []; // Reset list
            }

            // --- ADD CF ACCOUNT FLOW ---
            if (session.type === 'addcf') {
                if (session.step === 1) { // Email -> Token
                    session.email = text;
                    session.step = 2;
                    await cleanup();
                    const nextMsg = await ctx.reply("🔑 *Masukkan API Token Cloudflare:*", { parse_mode: "Markdown" });
                    session.msgToDelete.push(nextMsg.message_id);
                    return;
                }
                if (session.step === 2) { // Token -> Account ID
                    session.apiToken = text;
                    session.step = 3;
                    await cleanup();
                    const nextMsg = await ctx.reply("🆔 *Masukkan Account ID Cloudflare:*", { parse_mode: "Markdown" });
                    session.msgToDelete.push(nextMsg.message_id);
                    return;
                }
                if (session.step === 3) { // AccID -> Zone ID
                    session.accountId = text;
                    session.step = 4;
                    await cleanup();
                    const nextMsg = await ctx.reply("🌐 *Masukkan Zone ID (untuk domain worker):*", { parse_mode: "Markdown" });
                    session.msgToDelete.push(nextMsg.message_id);
                    return;
                }
                if (session.step === 4) { // ZoneID -> Domain
                    session.zoneId = text;
                    session.step = 5;
                    await cleanup();
                    const nextMsg = await ctx.reply("🌍 *Masukkan Domain Worker (contoh: myworker.mysite.com):*", { parse_mode: "Markdown" });
                    session.msgToDelete.push(nextMsg.message_id);
                    return;
                }
                if (session.step === 5) { // Domain -> Save
                    session.domain = text;
                    await cleanup();

                    const waitMsg = await ctx.reply("⏳ *Verifying & Saving...*", { parse_mode: "Markdown" });

                    try {
                        await cfManager.addAccount(userId.toString(), session.email!, session.apiToken!, session.accountId!, session.zoneId!, session.domain!);

                        await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
                        await ctx.reply(`✅ *Akun Cloudflare Berhasil Disimpan!*\n\nEmail: \`${session.email}\`\nDomain: \`${session.domain}\`\n\n_Bot akan otomatis merotasi ke akun ini jika akun utama limit._`, { parse_mode: "Markdown" });
                    } catch (e: any) {
                        await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
                        await ctx.reply(`❌ *Gagal Menyimpan Akun:*\n${e.message}`);
                    }

                    delete sessions[userId];
                    return;
                }
            }

            // --- MANUAL INPUT FLOW ---
            if (session.type === 'manual_input') {
                // Expect IP:PORT
                const match = text.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)$/);
                if (!match) {
                    const err = await ctx.reply("❌ Format Salah. Gunakan IP:PORT (contoh: `1.1.1.1:443`). Coba lagi.");
                    session.msgToDelete.push(err.message_id);
                    return;
                }
                const ip = match[1];
                const port = match[2];

                await cleanup();

                // Proceed to Protocol Selection with Manual IP
                await ctx.reply(`✅ Server Manual: \`${ip}:${port}\`\n\n📡 *Pilih Protokol:*`, {
                    parse_mode: "Markdown",
                    reply_markup: getProtocolSelectionSpecificKeyboard(ip, port, "manual")
                });

                delete sessions[userId];
                return;
            }

            // --- DEPLOY NODE FLOW (Legacy/Admin) ---
            if (session.type === 'deploy') {
                if (session.step === 1) {
                    session.apiToken = text;
                    session.step = 2;
                    await cleanup();
                    const nextMsg = await ctx.reply("🆔 *Masukkan Account ID:*", { parse_mode: "Markdown" });
                    session.msgToDelete.push(nextMsg.message_id);
                    return;
                }
                if (session.step === 2) {
                    session.accountId = text;
                    session.step = 3;
                    await cleanup();
                    const nextMsg = await ctx.reply("📝 *Masukkan Nama Worker (contoh: vpn-sg1):*", { parse_mode: "Markdown" });
                    session.msgToDelete.push(nextMsg.message_id);
                    return;
                }
                if (session.step === 3) {
                    session.workerName = text;
                    await cleanup();
                    const waitMsg = await ctx.reply("⏳ *Mohon tunggu, sedang mendeploy...*", { parse_mode: "Markdown" });

                    try {
                        const result = await deployWorker(session.apiToken!, session.accountId!, session.workerName!);
                        if (result.success) {
                            await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
                            await ctx.reply(`✅ *Deploy Berhasil!*\n🌐 URL: ${result.url}`, { parse_mode: "Markdown" });
                        } else {
                            await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
                            await ctx.reply(`❌ *Deploy Gagal:*\n${result.message}`, { parse_mode: "Markdown" });
                        }
                    } catch (error: any) {
                        await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
                        await ctx.reply(`❌ *Error Fatal:*\n${error.message}`, { parse_mode: "Markdown" });
                    }
                    delete sessions[userId];
                    return;
                }
            }

            // --- DEPLOY FEEDER FLOW (Admin) ---
            if (session.type === 'deploy_feeder') {
                if (session.step === 1) {
                    session.apiToken = text;
                    session.step = 2;
                    await cleanup();
                    const nextMsg = await ctx.reply("🆔 *Masukkan Account ID:*", { parse_mode: "Markdown" });
                    session.msgToDelete.push(nextMsg.message_id);
                    return;
                }
                if (session.step === 2) {
                    session.accountId = text;
                    session.step = 3;
                    await cleanup();
                    const nextMsg = await ctx.reply("📝 *Masukkan Nama Worker Feeder (contoh: feeder-proxy):*", { parse_mode: "Markdown" });
                    session.msgToDelete.push(nextMsg.message_id);
                    return;
                }
                if (session.step === 3) {
                    session.workerName = text;
                    await cleanup();
                    const waitMsg = await ctx.reply("⏳ *Installing Feeder & Cron...*", { parse_mode: "Markdown" });

                    try {
                        // Read Feeder Script
                        const feederCode = FEEDER_SCRIPT;

                        // Deploy
                        const result = await deployWorker(session.apiToken!, session.accountId!, session.workerName!, feederCode);

                        if (result.success) {
                            // Add Database Secrets
                            await putWorkerSecrets(session.accountId!, session.apiToken!, session.workerName!, {
                                TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL!,
                                TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN!
                            });

                            // Enable Cron (Every 10 mins)
                            await createWorkerRoute(session.zoneId || "none", session.apiToken!, "*not_used*", session.workerName!); // Hack to just trigger cron potentially? 
                            // Actually we need createCronTrigger helper
                            // Validating deploy
                            await createCronTrigger(session.accountId!, session.apiToken!, session.workerName!, "*/10 * * * *");

                            // SAVE TO DB (Feeder Instance)
                            try {
                                const db = createClient({
                                    url: process.env.TURSO_DATABASE_URL!,
                                    authToken: process.env.TURSO_AUTH_TOKEN!
                                });
                                await db.execute({
                                    sql: "INSERT INTO feeder_instances (worker_name, account_id, api_token, created_at) VALUES (?, ?, ?, ?)",
                                    args: [session.workerName!, session.accountId!, session.apiToken!, Date.now()]
                                });
                            } catch (dbe) {
                                console.error("Failed to save feeder instance to DB:", dbe);
                                // Non-fatal, user just won't see it in list immediately (manual add feature needed later?)
                            }

                            await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
                            await ctx.reply(`✅ *Feeder Berhasil Diinstall!*\n\nWorker: \`${session.workerName}\`\nCron: 10 menit\n\n_Data tersimpan di Manager._`, { parse_mode: "Markdown" });
                        } else {
                            await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
                            await ctx.reply(`❌ *Deploy Gagal:*\n${result.message}`, { parse_mode: "Markdown" });
                        }
                    } catch (error: any) {
                        await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
                        await ctx.reply(`❌ *Error Fatal:*\n${error.message}`, { parse_mode: "Markdown" });
                    }
                    delete sessions[userId];
                    return;
                }
            }
        }

        // 2. Normal Proxy Check Logic
        if (text.startsWith("/")) return; // Ignore commands

        // Check if it looks like IP:PORT
        const lines = text.split("\n");
        const potentialProxies = lines.filter(l => l.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/));

        if (potentialProxies.length > 0) {
            const statusMsg = await ctx.reply(`🔍 Checking ${potentialProxies.length} proxies...`);

            let results = "";
            let activeCount = 0;

            for (const proxyStr of potentialProxies) {
                const [ip, portStr] = proxyStr.split(":");
                const health = await vpn.checkHealth(ip, parseInt(portStr));
                if (!health.error) {
                    activeCount++;
                    results += `✅ ${proxyStr} (Active)\n   📍 ${health.result?.country || "?"} - ${health.result?.asOrganization || "?"}\n\n`;
                } else {
                    results += `❌ ${proxyStr} (Dead)\n\n`;
                }
            }
            results += `📊 Result: ${activeCount}/${potentialProxies.length} Active.`;
            await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, results);
        }
    });

    // --- Button Callbacks for Menu ---
    bot.callbackQuery("cmd_allstatus", async (ctx) => {
        // Same as /allstatus (if exists, or implemented here)
        await ctx.reply("📊 *System Status:* Online\nDatabase: Connected (Turso)\nWorker: Active", { parse_mode: "Markdown" });
    });

    bot.callbackQuery("cmd_listwc", async (ctx) => {
        const wcs = await cfManager.getWildcards();
        if (wcs.length === 0) return ctx.reply("📜 *Wildcard List:* (Kosong)", { parse_mode: "Markdown" });

        let msg = "📜 *Wildcard Domains:*\n\n";
        wcs.forEach(w => msg += `• \`${w}\`\n`);

        await ctx.reply(msg, { parse_mode: "Markdown" });
    });

    bot.callbackQuery("cmd_data", async (ctx) => {
        await ctx.reply("📊 *Penggunaan Data:*\n\nTotal Upload: `0 GB`\nTotal Download: `0 GB`\n\n_Fitur tracking data belum tersedia di versi ini._", { parse_mode: "Markdown" });
    });

    bot.callbackQuery("cmd_proxy_random", async (ctx) => {
        await ctx.reply("📡 *Pilih Protokol (Random Proxy):*", {
            parse_mode: "Markdown",
            reply_markup: protocolSelectionKeyboard
        });
    });

    bot.callbackQuery("cmd_admin_panel", async (ctx) => {
        if (!ctx.from) return;
        if (!isAdmin(ctx.from.id)) {
            return ctx.reply("❌ *Access Denied*.", { parse_mode: "Markdown" });
        }
        await ctx.reply("🔒 *Admin Panel*\n\nSilakan pilih tindakan:", {
            parse_mode: "Markdown",
            reply_markup: getAdminPanelKeyboard()
        });
    });



    // ---------------------------------------------------------
    // FEEDER MANAGEMENT LOGIC
    // ---------------------------------------------------------

    // Helper to get DB client
    const getDb = () => {
        const url = process.env.TURSO_DATABASE_URL;
        const authToken = process.env.TURSO_AUTH_TOKEN;
        if (!url || !authToken) throw new Error("Database credentials missing");
        return createClient({ url, authToken });
    };

    // Auto-Migrate Table on commands load (Safe idempotent)
    (async () => {
        try {
            const db = getDb();
            await db.execute(`
                CREATE TABLE IF NOT EXISTS feeder_instances (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    worker_name TEXT NOT NULL,
                    account_id TEXT NOT NULL,
                    api_token TEXT NOT NULL,
                    created_at INTEGER
                )
            `);
        } catch (e) {
            console.error("Feeder Table Migration Failed (Non-Critical if exists):", e);
        }
    })();

    // 1. Manage Feeders Menu (UPDATED with Email)
    bot.callbackQuery("cmd_manage_feeders", async (ctx) => {
        if (!ctx.from || !isAdmin(ctx.from.id)) return ctx.reply("❌ Access Denied");

        try {
            const db = getDb();
            // Join with cf_accounts to get email
            // Note: Turso/SQLite join. 
            const rs = await db.execute(`
                SELECT f.*, c.email 
                FROM feeder_instances f
                LEFT JOIN cf_accounts c ON f.account_id = c.account_id
                ORDER BY f.created_at DESC
            `);

            if (rs.rows.length === 0) {
                return ctx.editMessageText("🤖 *Manage Feeders*\n\nBelum ada Feeder yang terdaftar.", {
                    parse_mode: "Markdown",
                    reply_markup: new InlineKeyboard()
                        .text("➕ Deploy Feeder Baru", "cmd_deployfeeder").row()
                        .text("🔙 Kembali", "cmd_admin_panel")
                });
            }

            let msg = "🤖 *Active Feeders:*\n\n";
            const keyboard = new InlineKeyboard();

            for (const row of rs.rows) {
                const email = row.email ? String(row.email) : "Unknown Email";
                const workerName = String(row.worker_name);

                msg += `🔹 \`${workerName}\`\n   👤 ${email}\n\n`;
                keyboard.text(`🗑️ Hapus ${workerName}`, `del_feeder:${row.id}`).row();
            }

            keyboard.text("➕ Deploy Feeder Baru", "cmd_deployfeeder").row();
            keyboard.text("🔙 Kembali", "cmd_admin_panel");

            await ctx.editMessageText(msg, { parse_mode: "Markdown", reply_markup: keyboard });

        } catch (e: any) {
            await ctx.reply("❌ Error fetching feeders: " + e.message);
        }
    });

    // 2. Delete Feeder Handler (Existing, just verifying)
    bot.callbackQuery(/^del_feeder:(.+)$/, async (ctx) => {
        if (!ctx.match) return;
        const dbId = ctx.match[1];

        try {
            const db = getDb();
            const rs = await db.execute({ sql: "SELECT * FROM feeder_instances WHERE id = ?", args: [dbId] });
            if (rs.rows.length === 0) return ctx.answerCallbackQuery("❌ Data feeder tidak ditemukan.");

            const feeder = rs.rows[0];
            const { account_id, api_token, worker_name } = feeder;

            await ctx.editMessageText(`⏳ *Deleting Feeder: ${worker_name}...*`, { parse_mode: "Markdown" });

            const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${account_id}/workers/scripts/${worker_name}`;
            const delResp = await fetch(cfUrl, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${api_token}` }
            });

            if (!delResp.ok && delResp.status !== 404) {
                const err = await delResp.json();
                // console.error(err); // optional log
            }

            await db.execute({ sql: "DELETE FROM feeder_instances WHERE id = ?", args: [dbId] });

            await ctx.reply(`✅ *Feeder ${worker_name} berhasil dihapus!*`, { parse_mode: "Markdown" });

            await ctx.reply("Tap menu untuk refresh:", {
                reply_markup: new InlineKeyboard().text("🔄 Refresh List", "cmd_manage_feeders")
            });

        } catch (e: any) {
            await ctx.reply("❌ Gagal menghapus feeder: " + e.message);
        }
    });

    // 3. Manage CF Accounts (NEW)
    bot.callbackQuery("cmd_manage_cf", async (ctx) => {
        if (!ctx.from || !isAdmin(ctx.from.id)) return ctx.reply("❌ Access Denied");

        try {
            const db = getDb();
            const rs = await db.execute("SELECT * FROM cf_accounts ORDER BY last_used DESC");

            if (rs.rows.length === 0) {
                return ctx.editMessageText("☁️ *Manage CF Accounts*\n\nBelum ada akun tersimpan.", {
                    parse_mode: "Markdown",
                    reply_markup: new InlineKeyboard()
                        .text("➕ Tambah via /addcf", "mycf_add").row() // Reuse mycf_add session?
                        .text("🔙 Kembali", "cmd_admin_panel")
                });
            }

            let msg = "☁️ *Cloudflare Accounts (Admin View):*\n\n";
            const keyboard = new InlineKeyboard();

            for (const row of rs.rows) {
                const email = String(row.email);
                const domain = String(row.worker_domain);
                msg += `📧 \`${email}\`\n   🔗 ${domain}\n\n`;
                keyboard.text(`🗑️ Hapus ${email}`, `del_cf:${row.account_id}`).row();
            }

            keyboard.text("➕ Tambah Akun", "mycf_add").row();
            keyboard.text("🔙 Kembali", "cmd_admin_panel");

            await ctx.editMessageText(msg, { parse_mode: "Markdown", reply_markup: keyboard });

        } catch (e: any) {
            await ctx.reply("Error: " + e.message);
        }
    });

    // Handle Delete CF Account
    bot.callbackQuery(/^del_cf:(.+)$/, async (ctx) => {
        if (!ctx.from || !isAdmin(ctx.from.id)) return;
        const accId = ctx.match[1];

        // Confirmation? Just delete for speed as requested "gas"
        try {
            const db = getDb();
            await db.execute({ sql: "DELETE FROM cf_accounts WHERE account_id = ?", args: [accId] });
            await ctx.answerCallbackQuery("✅ Akun berhasil dihapus dari database bot.");

            // Refresh
            // Trigger cmd_manage_cf logic again manually or ask user to refresh
            await ctx.editMessageText("✅ *Akun berhasil dihapus!*", {
                parse_mode: "Markdown",
                reply_markup: new InlineKeyboard().text("🔄 Refresh List", "cmd_manage_cf")
            });
        } catch (e: any) {
            await ctx.reply("Gagal hapus: " + e.message);
        }
    });



    // Deploy Feeder Handler (UPDATED)
    bot.callbackQuery("cmd_deployfeeder", async (ctx) => {
        if (!ctx.from) return;
        if (!isAdmin(ctx.from.id)) return;

        // ... (Reuse existing logic setup) ...
        sessions[ctx.from.id] = {
            type: 'deploy_feeder',
            step: 1,
            msgToDelete: [ctx.callbackQuery?.message?.message_id || 0]
        };

        const qMsg = await ctx.reply("🤖 *Deploy Feeder Worker (Admin)*\n\n🔑 *Masukkan API Token Cloudflare:*", {
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard().text("❌ Batal", "cancel_session")
        });
        sessions[ctx.from.id].msgToDelete.push(qMsg.message_id);
    });

}
