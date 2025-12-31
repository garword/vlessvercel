export const CONSTANTS = {
    // URLs
    SUB_PAGE_URL: "https://foolvpn.web.id/nautica",
    KV_PRX_URL: "https://raw.githubusercontent.com/FoolVPN-ID/Nautica/refs/heads/main/kvProxyList.json",
    PRX_BANK_URL: "https://raw.githubusercontent.com/FoolVPN-ID/Nautica/refs/heads/main/proxyList.txt",
    PRX_HEALTH_CHECK_API: "https://id1.foolvpn.web.id/api/v1/check",
    CONVERTER_URL: "https://api.foolvpn.web.id/convert",

    // DNS & Relay
    DNS_SERVER_ADDRESS: "8.8.8.8",
    DNS_SERVER_PORT: 53,
    RELAY_SERVER_UDP: {
        host: "udp-relay.hobihaus.space",
        port: 7300,
    },

    // Protocols
    PROTOCOLS: ["vless", "trojan", "ss"],
    PORTS: [443, 80],
};

export const COUNTRIES: Record<string, string> = {
    "ID": "🇮🇩 Indonesia",
    "SG": "🇸🇬 Singapore",
    "JP": "🇯🇵 Japan",
    "KR": "🇰🇷 Korea",
    "HK": "🇭🇰 Hong Kong",
    "TW": "🇹🇼 Taiwan",
    "TH": "🇹🇭 Thailand",
    "VN": "🇻🇳 Vietnam",
    "MY": "🇲🇾 Malaysia",
    "IN": "🇮🇳 India",
    "US": "🇺🇸 United States",
    "GB": "🇬🇧 United Kingdom",
    "DE": "🇩🇪 Germany",
    "NL": "🇳🇱 Netherlands",
    "FR": "🇫🇷 France",
    "AU": "🇦🇺 Australia",
    "CA": "🇨🇦 Canada",
    "CN": "🇨🇳 China",
    "RU": "🇷🇺 Russia",
    "UA": "🇺🇦 Ukraine",
    "TR": "🇹🇷 Turkey",
    "BR": "🇧🇷 Brazil",
    "SA": "🇸🇦 Saudi Arabia",
    "AE": "🇦🇪 UAE",
    "IR": "🇮🇷 Iran",
    "IT": "🇮🇹 Italy",
    "ES": "🇪🇸 Spain",
    "PT": "🇵🇹 Portugal",
    "PL": "🇵🇱 Poland",
    "RO": "🇷🇴 Romania",
    "CH": "🇨🇭 Switzerland",
    "SE": "🇸🇪 Sweden",
    "NO": "🇳🇴 Norway",
    "FI": "🇫🇮 Finland",
    "DK": "🇩🇰 Denmark",
    "IE": "🇮🇪 Ireland",
    "NZ": "🇳🇿 New Zealand",
    "ZA": "🇿🇦 South Africa",
    "EG": "🇪🇬 Egypt",
    "IL": "🇮🇱 Israel",
    "PH": "🇵🇭 Philippines",
    "PK": "🇵🇰 Pakistan",
    "BD": "🇧🇩 Bangladesh",
    "VN_1": "🇻🇳 Vietnam 1",
    "VN_2": "🇻🇳 Vietnam 2"
};

export const FLAG_EMOJIS: Record<string, string> = Object.keys(COUNTRIES).reduce((acc, code) => {
    acc[code] = COUNTRIES[code].split(" ")[0];
    return acc;
}, {} as Record<string, string>);
