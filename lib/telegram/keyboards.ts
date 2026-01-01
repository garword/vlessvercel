import { InlineKeyboard } from "grammy";
import { COUNTRIES } from "../utils/constants";
import { ITEMS_PER_PAGE, getFlagEmoji } from "../utils/helpers";
import { ProxyItem } from "../vpn/nautica";

// --- HELPERS ---

/**
 * Adds a standard navigation row: [ 🔙 Kembali ] [ 🏠 Menu Utama ]
 */
export function addNavigationRow(keyboard: InlineKeyboard, backCallback: string = "menu_page:0", homeCallback: string = "menu_page:0") {
    keyboard.row().text("🔙 Kembali", backCallback).text("🏠 Menu Utama", homeCallback);
    return keyboard;
}

/**
 * Adds a pagination row: [ ⬅️ ] [ Page X/Y ] [ ➡️ ]
 */
export function addPaginationRow(keyboard: InlineKeyboard, page: number, totalPages: number, prefix: string) {
    const prevPage = page > 0 ? page - 1 : totalPages - 1;
    const nextPage = page < totalPages - 1 ? page + 1 : 0;

    keyboard.row()
        .text("⬅️", `${prefix}:${prevPage}`)
        .text(`${page + 1}/${totalPages}`, "noop")
        .text("➡️", `${prefix}:${nextPage}`);
    return keyboard;
}

// --- KEYBOARDS ---

// Main Menu Commands Definition
export const MENU_COMMANDS = [
    { text: "🚀 Buat Akun", custom_id: "cmd_proxy" },
    { text: "✏️ Input Manual", custom_id: "cmd_manual_input" },
    { text: "🌏 List Proxy", custom_id: "list_vless:0" }, // Changed to callback for pagination
    { text: "🔗 Get Sub Link", custom_id: "cmd_sub" },
    { text: "📜 List Wildcard", custom_id: "cmd_listwc" }, // Might need pagination later
    { text: "📊 Check Status", custom_id: "cmd_allstatus" },
    { text: "☁️ My CF Account", custom_id: "cmd_mycf" },
    { text: "👷 Deploy Node", custom_id: "cmd_deploynode" }
];

// Paginated Main Menu Keyboard
export function getMainMenuKeyboard(page: number = 0) {
    const itemsPerPage = 6; // Increased to show more
    const totalPages = Math.ceil(MENU_COMMANDS.length / itemsPerPage);

    // Normalize page
    if (page < 0) page = totalPages - 1;
    if (page >= totalPages) page = 0;

    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const currentItems = MENU_COMMANDS.slice(start, end);

    const keyboard = new InlineKeyboard();

    let colCount = 0;
    for (const item of currentItems) {
        keyboard.text(item.text, item.custom_id);
        colCount++;
        if (colCount % 2 === 0) keyboard.row();
    }
    if (colCount % 2 !== 0) keyboard.row();

    // Only add pagination if needed
    if (totalPages > 1) {
        addPaginationRow(keyboard, page, totalPages, "menu_page");
    }

    return keyboard;
}

// Deprecated export mapped to new function
export const mainMenuKeyboard = getMainMenuKeyboard(0);

// Proxy List Keyboard (Now Paginated)
export function getProxyListKeyboard(proxies: ProxyItem[], page: number = 0, actionPrefix: string = "sel_prx") {
    const itemsPerPage = 5;
    const totalPages = Math.ceil(proxies.length / itemsPerPage);

    if (page < 0) page = totalPages - 1;
    if (page >= totalPages) page = 0;

    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const currentProxies = proxies.slice(start, end);

    const keyboard = new InlineKeyboard();

    currentProxies.forEach(proxy => {
        const flag = getFlagEmoji(proxy.country);
        const safeOrg = proxy.org.length > 20 ? proxy.org.substring(0, 18) + ".." : proxy.org;
        const label = `(${proxy.country}) ${safeOrg} ${flag}`;

        // Pass minimal data in callback to avoid limits: IP:PORT
        keyboard.text(label, `${actionPrefix}:${proxy.ip}:${proxy.port}`).row();
    });

    if (totalPages > 1) {
        addPaginationRow(keyboard, page, totalPages, `page_${actionPrefix}`);
    }

    // Manual Input Option always available
    keyboard.row().text("✏️ Input Manual", "cmd_manual_input");

    addNavigationRow(keyboard); // Back to Main Menu
    return keyboard;
}

// Format Selection for Specific Proxy (Step 2 of Proxy Flow)
export function getFormatSpecificKeyboard(ip: string, port: string, type: 'manual' | 'auto' = 'auto') {
    const base = `gen_spec:${ip}:${port}`;
    const keyboard = new InlineKeyboard()
        .text("📱 URI / Raw", `${base}:raw`)
        .text("⚔️ Clash", `${base}:clash`)
        .row()
        .text("📦 Sing-box", `${base}:sfa`)
        .text("🔗 V2Ray Sub", `${base}:v2ray`);

    // Back Logic: If manual, go to main menu? If auto, go back to list?
    // For simplicity, Back currently goes to main menu, but improved UX would be:
    const backCallback = type === 'manual' ? "menu_page:0" : "list_vless:0";
    addNavigationRow(keyboard, backCallback);

    return keyboard;
}

// Protocol Selection (Step 3 or Start)
export function getProtocolSelectionKeyboard(backCallback: string = "menu_page:0") {
    const keyboard = new InlineKeyboard()
        .text("🚀 VLESS", "proto_select:vless")
        .text("🐎 Trojan", "proto_select:trojan")
        .text("⚡ VMess", "proto_select:vmess");

    addNavigationRow(keyboard, backCallback);
    return keyboard;
}

// Deprecated static, mapped to function
export const protocolSelectionKeyboard = getProtocolSelectionKeyboard();

// Inject Method Selection
export function getInjectMethodKeyboard(protocol: string, backCallback: string = "cmd_proxy") {
    const keyboard = new InlineKeyboard()
        .text("Tidak", `inject_method:none:${protocol}`)
        .text("Wildcard", `inject_method:wildcard:${protocol}`)
        .row()
        .text("SNI/TLS", `inject_method:sni:${protocol}`);

    addNavigationRow(keyboard, backCallback);
    return keyboard;
}

// Country Selection for Proxy (Step 1 of Auto Flow)
export function getCountryKeyboard(page: number = 0, actionPrefix: string = "proxy_country") {
    const countryCodes = Object.keys(COUNTRIES);
    const totalPages = Math.ceil(countryCodes.length / ITEMS_PER_PAGE);

    if (page < 0) page = totalPages - 1;
    if (page >= totalPages) page = 0;

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

    // Pagination
    if (totalPages > 1) {
        addPaginationRow(keyboard, page, totalPages, `page_${actionPrefix}`);
    }

    // Add Random & Back
    keyboard.row().text("🎲 Random", `${actionPrefix}:RANDOM`);
    addNavigationRow(keyboard);

    return keyboard;
}

// Get Sub Format Selection
export function getSubFormatKeyboard() {
    const keyboard = new InlineKeyboard()
        .text("VLESS", "sub_format:v2ray")
        .text("CLASH", "sub_format:clash")
        .row()
        .text("TROJAN", "sub_format:trojan")
        .text("VMESS", "sub_format:vmess");

    addNavigationRow(keyboard);
    return keyboard;
}

// Deprecated static
export const subFormatKeyboard = getSubFormatKeyboard();

// Specific Protocol Selection (For Manual Input usually)
export function getProtocolSelectionSpecificKeyboard(ip: string, port: string, method: string) {
    const base = `proto_spec:${ip}:${port}:${method}`;
    const keyboard = new InlineKeyboard()
        .text("🚀 VLESS", `${base}:vless`)
        .text("🐎 Trojan", `${base}:trojan`)
        .text("VMess", `${base}:vmess`);

    addNavigationRow(keyboard, "cmd_manual_input"); // Back to manual input start? Or main menu.
    return keyboard;
}

// Format Selection Keyboard (Existing/Restored)
export function getFormatKeyboard(countryCode: string) {
    const keyboard = new InlineKeyboard()
        .text("📱 URI / Raw", `gen_vless:${countryCode}:raw`)
        .text("⚔️ Clash", `gen_vless:${countryCode}:clash`)
        .row()
        .text("📦 Sing-box", `gen_vless:${countryCode}:sfa`)
        .text("🔗 V2Ray Sub", `gen_vless:${countryCode}:v2ray`);

    addNavigationRow(keyboard, `proxy_country:${countryCode}`); // Back to country selection?
    return keyboard;
}

// Specific Inject Method Keyboard (Restored)
export function getInjectMethodSpecificKeyboard(ip: string, port: string) {
    const base = `inject_spec:${ip}:${port}`;
    const keyboard = new InlineKeyboard()
        .text("Tidak", `${base}:none`)
        .text("Wildcard", `${base}:wildcard`)
        .row()
        .text("SNI/TLS", `${base}:sni`);

    addNavigationRow(keyboard, "cmd_proxy");
    return keyboard;
}

