import { InlineKeyboard } from "grammy";
import { COUNTRIES } from "../utils/constants";
import { ITEMS_PER_PAGE } from "../utils/helpers";
import { ProxyItem } from "../vpn/nautica";

// Main Menu
// Main Menu Commands Definition
export const MENU_COMMANDS = [
    // User Commands
    { text: "🚀 Generate Proxy", custom_id: "cmd_proxy" },
    { text: "🎲 Random Proxy", custom_id: "cmd_proxyrandom" },
    { text: "🌏 List VLESS", custom_id: "cmd_listvless" },
    { text: "🔗 Get Sub Link", custom_id: "cmd_sub" },
    { text: "📜 List Wildcard", custom_id: "cmd_listwc" },
    { text: "➕ Add Wildcard", custom_id: "cmd_addwc" }, // Requires input usually, but we can prompt
    { text: "📊 Check Status", custom_id: "cmd_allstatus" },
    { text: "📉 Data Usage", custom_id: "cmd_data" },
    // Admin Commands (Will be filtered in logic if needed, or shown all)
    { text: "👷 Deploy Node", custom_id: "cmd_deploynode" },
    { text: "➕ Add VLESS", custom_id: "cmd_addvless" },
    { text: "🗑️ Del VLESS", custom_id: "cmd_delvless" },
    { text: "🧹 Clean Dead", custom_id: "cmd_delvlessdead" },
    { text: "❌ Del Wildcard", custom_id: "cmd_delwc" }
];

// Paginated Main Menu Keyboard
export function getMainMenuKeyboard(page: number = 0) {
    const itemsPerPage = 4;
    const totalPages = Math.ceil(MENU_COMMANDS.length / itemsPerPage);

    // Normalize page
    if (page < 0) page = totalPages - 1;
    if (page >= totalPages) page = 0;

    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const currentItems = MENU_COMMANDS.slice(start, end);

    const keyboard = new InlineKeyboard();

    // 2x2 Grid
    let colCount = 0;
    for (const item of currentItems) {
        keyboard.text(item.text, item.custom_id);
        colCount++;
        if (colCount % 2 === 0) keyboard.row();
    }
    if (colCount % 2 !== 0) keyboard.row();

    // Navigation Row
    const prevPage = page > 0 ? page - 1 : totalPages - 1;
    const nextPage = page < totalPages - 1 ? page + 1 : 0;

    keyboard
        .text("⬅️ Back", `menu_page:${prevPage}`)
        .text(`${page + 1}/${totalPages}`, "noop")
        .text("Next ➡️", `menu_page:${nextPage}`);

    return keyboard;
}

// Deprecated old keyboard, mapped to new function for compatibility
export const mainMenuKeyboard = getMainMenuKeyboard(0);

// Inject Method Keyboard (New)
export const injectMethodKeyboard = new InlineKeyboard()
    .text("Tidak", "inject_method:none")
    .text("Wildcard", "inject_method:wildcard")
    .row()
    .text("SNI/TLS", "inject_method:sni");

export function getProxyListKeyboard(proxies: ProxyItem[]) {
    const keyboard = new InlineKeyboard();

    proxies.forEach(proxy => {
        const flag = COUNTRIES[proxy.country]?.split(" ")[0] || "🏳️";
        // Shorten label
        const label = `(${proxy.country}) ${proxy.org} ${flag}`.slice(0, 40);
        keyboard.text(label, `sel_prx:${proxy.ip}:${proxy.port}`).row();
    });

    keyboard.text("🔄 Refresh List", "cmd_proxy"); // Button to re-fetch/randomize
    return keyboard;
}

export function getFormatSpecificKeyboard(ip: string, port: string) {
    const base = `gen_spec:${ip}:${port}`;
    return new InlineKeyboard()
        .text("📱 URI / Raw", `${base}:raw`)
        .text("⚔️ Clash", `${base}:clash`)
        .row()
        .text("📦 Sing-box", `${base}:sfa`)
        .text("🔗 V2Ray Sub", `${base}:v2ray`)
        .row()
        .text("🔙 Kembali", "cmd_proxy");
}

// Protocol Selection Actions
export const protocolSelectionKeyboard = new InlineKeyboard()
    .text("🚀 VLESS", "proto_select:vless")
    .text("🐎 Trojan", "proto_select:trojan")
    .text("⚡ VMess", "proto_select:vmess");


// Inject Method Keyboard (Modified to accept protocol)
export function getInjectMethodKeyboard(protocol: string) {
    return new InlineKeyboard()
        .text("Tidak", `inject_method:none:${protocol}`)
        .text("Wildcard", `inject_method:wildcard:${protocol}`)
        .row()
        .text("SNI/TLS", `inject_method:sni:${protocol}`);
}
export function getCountryKeyboard(page: number = 0, actionPrefix: string = "proxy_country") {
    const countryCodes = Object.keys(COUNTRIES);
    const totalPages = Math.ceil(countryCodes.length / ITEMS_PER_PAGE);
    const start = page * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const currentCountries = countryCodes.slice(start, end);

    const keyboard = new InlineKeyboard();

    let colCount = 0;
    for (const code of currentCountries) {
        keyboard.text(COUNTRIES[code].split(" ")[0] + " " + code, `${actionPrefix}:${code}`);
        colCount++;
        if (colCount % 3 === 0) keyboard.row();
    }
    if (colCount % 3 !== 0) keyboard.row();

    const prevPage = page > 0 ? page - 1 : totalPages - 1;
    const nextPage = page < totalPages - 1 ? page + 1 : 0;

    keyboard
        .text(`⬅️`, `page_${actionPrefix}:${prevPage}`)
        .text(`🎲 Random`, `${actionPrefix}:RANDOM`)
        .text(`➡️`, `page_${actionPrefix}:${nextPage}`);

    return keyboard;
}

// Format Selection Keyboard (Existing)
export function getFormatKeyboard(countryCode: string) {
    return new InlineKeyboard()
        .text("📱 URI / Raw", `gen_vless:${countryCode}:raw`)
        .text("⚔️ Clash", `gen_vless:${countryCode}:clash`)
        .row()
        .text("📦 Sing-box", `gen_vless:${countryCode}:sfa`)
        .text("🔗 V2Ray Sub", `gen_vless:${countryCode}:v2ray`)
        .row()
        .text("🔙 Kembali", "cmd_proxy");
}

// Specific Inject Method Keyboard
export function getInjectMethodSpecificKeyboard(ip: string, port: string) {
    const base = `inject_spec:${ip}:${port}`;
    return new InlineKeyboard()
        .text("Tidak", `${base}:none`)
        .text("Wildcard", `${base}:wildcard`)
        .row()
        .text("SNI/TLS", `${base}:sni`)
        .row()
        .text("🔙 Kembali", "cmd_proxy");
}

// Specific Protocol Selection Keyboard
export function getProtocolSelectionSpecificKeyboard(ip: string, port: string, method: string) {
    const base = `proto_spec:${ip}:${port}:${method}`;
    return new InlineKeyboard()
        .text("🚀 VLESS", `${base}:vless`)
        .text("🐎 Trojan", `${base}:trojan`)
        .text("VMess", `${base}:vmess`)
        .row()
        .text("🔙 Kembali", `sel_prx:${ip}:${port}`);
}

// Subscription Format Keyboard (Updated)
export const subFormatKeyboard = new InlineKeyboard()
    .text("VLESS", "sub_format:v2ray")
    .text("CLASH", "sub_format:clash")
    .row()
    .text("TROJAN", "sub_format:trojan")
    .text("VMESS", "sub_format:vmess");
