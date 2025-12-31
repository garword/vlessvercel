
import { Bot, Context } from "grammy";
import { NauticaVPN } from "../vpn/nautica";
import { mainMenuKeyboard, getCountryKeyboard, getFormatKeyboard, getInjectMethodKeyboard, getInjectMethodSpecificKeyboard, protocolSelectionKeyboard, subFormatKeyboard } from "./keyboards";
import { getFlagEmoji } from "../utils/helpers";
import { deployWorker } from "../deploy/cf_api";

export function setupCommands(bot: Bot) {
    const vpn = NauticaVPN.getInstance();
    const adminId = process.env.ADMIN_ID; // Use process.env in Next.js

    const isAdmin = (id: number) => {
        if (!adminId) return false;
        return id.toString() === adminId;
    };

    // /start command
    bot.command("start", async (ctx: Context) => {
        const welcomeMsg =
            "🎉 *Selamat datang di Nautica Bot! (Vercel Edition)*\n\n" +
            "Kirimkan proxy untuk di cek statusnya, format ip:port maksimal 20 proxy.\n" +
            "dipisahkan dengan enter contoh: \n" +
            "192.168.1.1:8443\n" +
            "dst\n\n" +
            "📋 *Daftar Command:*\n\n" +
            "👤 *User Commands:*\n" +
            "/proxy - Membuat config VLESS dari daftar proxy\n" +
            "/proxyrandom - Membuat VLESS random\n" +
            "/listvless - Untuk melihat daftar ISP / Negara\n" +
            "/getsub - Mengambil API link subscription\n" +
            "/listwildcard - Melihat daftar wildcard\n" +
            "/addwc - Menambahkan wildcard (User defined) \n" +
            "/allstatus - Melihat report status proxy\n" +
            "/data - Untuk melihat penggunaan data\n\n" +
            "🔧 *Admin Commands:*\n" +
            "/deploynode - Deploy VPN Worker ke Account Lain \n" +
            "/addvless - Menambah VLESS\n" +
            "/delvless - Menghapus VLESS\n" +
            "/delvlessdead - Menghapus VLESS mati\n" +
            "/delwc - Menghapus wildcard";

        await ctx.reply(welcomeMsg, {
            parse_mode: "Markdown",
            reply_markup: mainMenuKeyboard
        });
    });

    // /listwildcard command
    bot.command("listwildcard", async (ctx: Context) => {
        const wildcards = await vpn.getWildcards();
        if (wildcards.length === 0) return ctx.reply("❌ Tidak ada wildcard aktif.");

        let msg = `📜 * Daftar wildcard aktif:*\n\n`;
        wildcards.forEach((w: string, i: number) => {
            msg += `${i + 1}.\`${w}\`\n`;
        });
        await ctx.reply(msg, { parse_mode: "Markdown" });
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
            ntlsConfig = `vless://${freshUuid}@${ntlsAddress}:80?encryption=none&security=none&type=ws&host=${ntlsHost}&path=${pathValue}%23${encodeURIComponent(name)}`;
        } else if (protocol === "trojan") {
            tlsConfig = vpn.generateTrojan(proxy, domain, freshUuid, bugHost);

            let ntlsAddress = bugHost || domain;
            let ntlsHost = domain;
            ntlsConfig = `trojan://${freshUuid}@${ntlsAddress}:80?security=none&type=ws&host=${ntlsHost}&path=${pathValue}%23${encodeURIComponent(name)}`;
        } else if (protocol === "vmess") {
            tlsConfig = vpn.generateVmess(proxy, domain, freshUuid, bugHost);

            let ntlsAddress = bugHost || domain;
            let ntlsHost = domain;
            const vmessObj = {
                v: "2", ps: name, add: ntlsAddress, port: 80, id: freshUuid, aid: "0", scy: "auto", net: "ws", type: "none", host: ntlsHost, path: pathValue, tls: ""
            };
            ntlsConfig = `vmess://${btoa(JSON.stringify(vmessObj))}`;
        }

        // YAML Config
        let proxyBlock = "";
        const yamlServer = bugHost || domain;
        const yamlSni = domain;

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
        Host: ${yamlSni}
    udp: true`;
        } else if (protocol === "trojan") {
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
        Host: ${yamlSni}
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
