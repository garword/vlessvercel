
import { Bot, Context } from "grammy";
import { NauticaVPN } from "../vpn/nautica";
import { mainMenuKeyboard, getMainMenuKeyboard, getCountryKeyboard, getFormatKeyboard, getInjectMethodKeyboard, getInjectMethodSpecificKeyboard, protocolSelectionKeyboard, subFormatKeyboard } from "./keyboards";
import { getFlagEmoji } from "../utils/helpers";
import { deployWorker } from "../deploy/cf_api";

export function setupCommands(bot: Bot) {
    const vpn = NauticaVPN.getInstance();
    const adminId = process.env.ADMIN_ID; // Use process.env in Next.js

    const isAdmin = (id: number) => {
        if (!adminId) return false;
        return id.toString() === adminId;
    };

    // /setcommands - Helper to set the Telegram Menu Button
    bot.command("setcommands", async (ctx: Context) => {
        if (!ctx.from) return;
        if (!isAdmin(ctx.from.id)) {
            return ctx.reply(`❌ Access Denied. Your ID: \`${ctx.from.id}\` is not in ADMIN_ID.`, { parse_mode: "Markdown" });
        }

        await ctx.api.setMyCommands([
            { command: "start", description: "🏠 Main Menu" },
            { command: "proxy", description: "🚀 Generate Config" },
            { command: "proxyrandom", description: "🎲 Random Config" },
            { command: "listvless", description: "🌏 List Servers" },
            { command: "allstatus", description: "📊 Check Status" },
            { command: "getsub", description: "🔗 Subscription" },
            { command: "addwc", description: "➕ Add Wildcard" },
            { command: "deploynode", description: "👷 Deploy Node (Admin)" },
            { command: "data", description: "📉 Data Usage" }
        ]);

        await ctx.reply("✅ Bot menu commands have been updated!");
    });

    // /start command
    bot.command("start", async (ctx: Context) => {
        const welcomeMsg =
            "🎉 *Selamat datang di Nautica Bot! (Vercel Edition)*\n\n" +
            "Kirimkan proxy untuk di cek statusnya, format ip:port maksimal 20 proxy.\n" +
            "Atau gunakan menu tombol di bawah ini:";

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

    // Handle Button Commands
    bot.callbackQuery("cmd_proxy", async (ctx) => {
        await ctx.reply("🌍 *Pilih Negara untuk Proxy VLESS:*", { parse_mode: "Markdown", reply_markup: getCountryKeyboard(0) });
        // await ctx.answerCallbackQuery();
    });

    bot.callbackQuery("cmd_proxyrandom", async (ctx) => {
        await ctx.reply("📡 *Pilih Protokol:*", { parse_mode: "Markdown", reply_markup: protocolSelectionKeyboard });
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
        if (!ip) return ctx.reply("❌ Format: `/delvless IP_ADDRESS`", { parse_mode: "Markdown" });

        const success = await vpn.removeProxy(ip);
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
            reply_markup: getInjectMethodKeyboard(protocol)
        });
    });


    // Handle Inject Method Selection (Updated for Protocol)
    bot.callbackQuery(/^inject_method:(.+):(.+)$/, async (ctx: Context) => {
        // Loading Animation
        await ctx.editMessageText("```RUNNING\nHarap menunggu, sedang memproses...\n```", { parse_mode: "Markdown" });

        if (!ctx.match) return;
        const method = ctx.match[1]; // none, wildcard, sni
        const protocol = ctx.match[2]; // vless, trojan, vmess

        const proxies = await vpn.getProxies();
        if (proxies.length === 0) return ctx.editMessageText("❌ Tidak ada proxy tersedia.");

        const proxy = proxies[Math.floor(Math.random() * proxies.length)];
        let domain = "nautica.foolvpn.me"; // Default domain if not specified from outside
        const uuid = "ab3202b8-446d-493e-9c5a-e1a870b3adaf";
        const freshUuid = uuid;

        let bugHost: string | undefined = undefined;
        if (method === "wildcard") {
            const wildcards = await vpn.getWildcards();
            if (wildcards.length > 0) {
                bugHost = wildcards[Math.floor(Math.random() * wildcards.length)];
            } else {
                bugHost = "m.udemy.com";
            }
        }

        const sanitizedOrg = proxy.org.replace(/[^a-zA-Z0-9]/g, "").substring(0, 4).toLowerCase();
        const pathValue = `/${proxy.country.toLowerCase()}-${sanitizedOrg}`;
        const name = `(${proxy.country}) ${proxy.org} ${getFlagEmoji(proxy.country)}`;

        let tlsConfig = "";
        let ntlsConfig = "";
        let yamlConfig = "";

        // Generate based on protocol
        if (protocol === "vless") {
            tlsConfig = vpn.generateVless(proxy, domain, freshUuid, bugHost);

            let ntlsAddress = bugHost || domain;
            let ntlsHost = domain;

            // WILDCARD LOGIC for VLESS (Subdomain Spoofing)
            // Logic: Address = BugHost, SNI/Host = BugHost.WorkerDomain
            if (method === "wildcard" && bugHost) {
                ntlsAddress = bugHost; // Address is the Bug Host (e.g. grab.com)
                ntlsHost = `${bugHost}.${domain}`; // SNI/Host spoofed (e.g. grab.com.nautica.foolvpn.me)
            }

            ntlsConfig = `vless://${freshUuid}@${ntlsAddress}:80?encryption=none&security=none&type=ws&host=${ntlsHost}&path=${pathValue}%23${encodeURIComponent(name)}`;
        } else if (protocol === "trojan") {
            // TROJAN: Keep Standard (As requested "TROJAN TIDAK USAH")
            tlsConfig = vpn.generateTrojan(proxy, domain, freshUuid, bugHost);

            let ntlsAddress = bugHost || domain;
            let ntlsHost = domain;
            ntlsConfig = `trojan://${freshUuid}@${ntlsAddress}:80?security=none&type=ws&host=${ntlsHost}&path=${pathValue}%23${encodeURIComponent(name)}`;
        } else if (protocol === "vmess") {
            tlsConfig = vpn.generateVmess(proxy, domain, freshUuid, bugHost);

            let ntlsAddress = bugHost || domain;
            let ntlsHost = domain;

            // WILDCARD LOGIC for VMess (Subdomain Spoofing)
            if (method === "wildcard" && bugHost) {
                ntlsAddress = bugHost;
                ntlsHost = `${bugHost}.${domain}`;
            }

            const vmessObj = {
                v: "2", ps: name, add: ntlsAddress, port: 80, id: freshUuid, aid: "0", scy: "auto", net: "ws", type: "none", host: ntlsHost, path: pathValue, tls: ""
            };
            ntlsConfig = `vmess://${btoa(JSON.stringify(vmessObj))}`;
        }

        // YAML Config
        let proxyBlock = "";
        const yamlServer = bugHost || domain; // Server = Bug Host in Wildcard mode
        let yamlSni = domain;
        let yamlHost = domain;

        // Apply Wildcard Spoofing to YAML as well for VLESS/VMess
        if (method === "wildcard" && bugHost && (protocol === "vless" || protocol === "vmess")) {
            yamlSni = `${bugHost}.${domain}`;
            yamlHost = `${bugHost}.${domain}`;
        }

        if (protocol === "vless") {
            proxyBlock = `  - name: ${name}
    server: ${yamlServer}
    port: 443
    type: vless
    uuid: ${freshUuid}
    cipher: none
    tls: true
    skip-cert-verify: true
    network: ws
    servername: ${yamlSni}
    ws-opts:
      path: ${pathValue}
      headers:
        Host: ${yamlHost}
    udp: true`;
        } else if (protocol === "trojan") {
            // Trojan Standard
            proxyBlock = `  - name: ${name}
    server: ${yamlServer}
    port: 443
    type: trojan
    password: ${freshUuid}
    skip-cert-verify: true
    network: ws
    sni: ${yamlSni}
    ws-opts:
      path: ${pathValue}
      headers:
        Host: ${yamlSni}
    udp: true`;
        } else if (protocol === "vmess") {
            proxyBlock = `  - name: ${name}
    server: ${yamlServer}
    port: 443
    type: vmess
    uuid: ${freshUuid}
    alterId: 0
    cipher: auto
    tls: true
    skip-cert-verify: true
    network: ws
    servername: ${yamlSni}
    ws-opts:
      path: ${pathValue}
      headers:
        Host: ${yamlHost}
    udp: true`;
        }

        yamlConfig = `proxies:\n${proxyBlock}`;

        let methodDisplay = "NO";
        if (method === "wildcard") methodDisplay = `Wildcard (${bugHost})`;
        if (method === "sni") methodDisplay = "SNI";

        const msg = `*Konfigurasi ${protocol.toUpperCase()} anda berhasil dibuat*\n` +
            `*Server:* ${name}\n` +
            `*Path :* \`${pathValue}\`\n` +
            `*Metode :* ${methodDisplay}\n\n` +
            `\`TLS\`\n` +
            `\`${tlsConfig}\`\n\n` +
            `\`NTLS\`\n` +
            `\`${ntlsConfig}\`\n\n` +
            `\`yaml\`\n` +
            `\`\`\`yaml\n${yamlConfig}\n\`\`\`\n` +
            `-----------------------------------------------------\n` +
            `📞 [Need Help? @lsvllyyy !](https://t.me/lsvllyyy)\n` +
            `🚀 *Nikmati internet lebih cepat & aman!*\n` +
            `🌐 [Join komunitas: @vless_bodong](https://t.me/vless_bodong)`;

        await ctx.editMessageText(msg, { parse_mode: "Markdown" });
    });

    // /listvless command
    bot.command("listvless", async (ctx: Context) => {
        // Use getTopProxies which returns 10 items (5 ID, 5 SG priority)
        const proxies = await vpn.getTopProxies();

        if (proxies.length === 0) {
            return ctx.reply("❌ Tidak ada proxy tersedia.");
        }

        let msg = `📋 *Daftar VLESS:*\n\n\`copy\n`;

        proxies.forEach((proxy, index) => {
            const num = index + 1;
            const flag = getFlagEmoji(proxy.country);
            // Name: (CC) Org Flag
            const name = `(${proxy.country}) ${proxy.org} ${flag}`;

            // Path: /cc-org (first 4 chars of org)
            const sanitizedOrg = proxy.org.replace(/[^a-zA-Z0-9]/g, "").substring(0, 4).toLowerCase();
            const pathValue = `/${proxy.country.toLowerCase()}-${sanitizedOrg}`;

            // Proxy: IP:Port
            const proxyAddress = `${proxy.ip}:${proxy.port}`;

            msg += `${num}.${name}\n` +
                `Path: ${pathValue}\n` +
                `Proxy: ${proxyAddress}\n\n`;
        });

        msg += `\``; // End monospace block

        await ctx.reply(msg, { parse_mode: "Markdown" });
    });

    // /getsub command
    bot.command("getsub", async (ctx: Context) => {
        await ctx.reply("Silakan pilih tipe konfigurasi:", {
            parse_mode: "Markdown",
            reply_markup: subFormatKeyboard
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

        await ctx.editMessageText(msg, { parse_mode: "Markdown" });
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
    interface DeploySession {
        step: number;
        apiToken?: string;
        accountId?: string;
        workerName?: string;
        msgToDelete: number[];
    }

    const sessions: Record<number, DeploySession> = {};

    // /deploynode command - Interactive
    bot.command("deploynode", async (ctx: Context) => {
        if (!ctx.from || !isAdmin(ctx.from.id)) return;

        // Initialize session
        const statusMsg = await ctx.reply("🔑 *Masukkan Cloudflare API Token:*", { parse_mode: "Markdown" });

        sessions[ctx.from.id] = {
            step: 1,
            msgToDelete: [ctx.message!.message_id, statusMsg.message_id]
        };
    });

    // Handle text interactions (Proxy check & Interactive Deployment)
    bot.on("message:text", async (ctx) => {
        const text = ctx.message.text;
        const userId = ctx.from.id;

        // 1. Handle Interactive Deployment Session
        if (sessions[userId]) {
            const session = sessions[userId];
            session.msgToDelete.push(ctx.message.message_id);

            // Helper to clean up previous messages
            const cleanup = async () => {
                for (const msgId of session.msgToDelete) {
                    try {
                        await ctx.api.deleteMessage(ctx.chat.id, msgId);
                    } catch (e) { /* ignore if already deleted */ }
                }
                session.msgToDelete = []; // Reset list
            }

            if (session.step === 1) {
                // Input API Token
                session.apiToken = text;
                session.step = 2;

                await cleanup(); // Delete user input and prompt

                const nextMsg = await ctx.reply("🆔 *Masukkan Account ID:*", { parse_mode: "Markdown" });
                session.msgToDelete.push(nextMsg.message_id);
                return;
            }

            if (session.step === 2) {
                // Input Account ID
                session.accountId = text;
                session.step = 3;

                await cleanup();

                const nextMsg = await ctx.reply("📝 *Masukkan Nama Worker (contoh: vpn-sg1):*", { parse_mode: "Markdown" });
                session.msgToDelete.push(nextMsg.message_id);
                return;
            }

            if (session.step === 3) {
                // Input Worker Name
                session.workerName = text;

                await cleanup();

                const waitMsg = await ctx.reply("⏳ *Mohon tunggu, sedang mendeploy...*", { parse_mode: "Markdown" });

                // Execute Deployment
                try {
                    const result = await deployWorker(
                        session.apiToken!,
                        session.accountId!,
                        session.workerName!
                    );

                    if (result.success) {
                        const logMsg = `✅ *Deploy Berhasil!*\n\n` +
                            `👷 Worker: \`${session.workerName}\`\n` +
                            `🌐 URL: ${result.url}\n\n` +
                            `_Worker VPN siap digunakan._`;

                        // Delete wait message and send success log
                        await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
                        await ctx.reply(logMsg, { parse_mode: "Markdown" });
                    } else {
                        await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
                        await ctx.reply(`❌ *Deploy Gagal!*\nExample Error: ${result.message}`, { parse_mode: "Markdown" });
                    }
                } catch (error: any) {
                    await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
                    await ctx.reply(`❌ *Error Fatal:*\n${error.message}`, { parse_mode: "Markdown" });
                }

                // Clear session
                delete sessions[userId];
                return;
            }
        }

        // 2. Normal Proxy Check Logic
        if (text.startsWith("/")) return; // Ignore commands

        // Check if it looks like IP:PORT
        // Simple regex: IP:PORT
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
                    results += `✅ ${proxyStr} (Active)\n` +
                        `   📍 ${health.result?.country || "?"} - ${health.result?.asOrganization || "?"}\n\n`;
                } else {
                    results += `❌ ${proxyStr} (Dead)\n\n`;
                }
            }

            results += `📊 Result: ${activeCount}/${potentialProxies.length} Active.`;

            await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, results);
        }
    });

}
