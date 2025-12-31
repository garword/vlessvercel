
export const VPN_SCRIPT = `
import { connect } from "cloudflare:sockets";

// --- CONSTANTS ---
const CONSTANTS = {
    KV_PRX_URL: "https://raw.githubusercontent.com/FoolVPN-ID/Nautica/refs/heads/main/kvProxyList.json",
    DNS_SERVER_ADDRESS: "8.8.8.8",
    DNS_SERVER_PORT: 53,
    RELAY_SERVER_UDP: {
        host: "udp-relay.hobihaus.space",
        port: 7300,
    },
};

const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;

// --- HELPERS ---
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function arrayBufferToHex(buffer) {
    return [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function base64ToArrayBuffer(base64Str) {
    if (!base64Str) {
        return { error: null };
    }
    try {
        base64Str = base64Str.replace(/-/g, "+").replace(/_/g, "/");
        const decode = atob(base64Str);
        const arryBuffer = Uint8Array.from(decode, (c) => c.charCodeAt(0));
        return { earlyData: arryBuffer.buffer, error: null };
    } catch (error) {
        return { error };
    }
}

// --- MAIN HANDLER ---
const horse = "dHJvamFu";
const flash = "dm1lc3M=";

let prxIP = "";

async function getKVPrxList() {
    const kvPrx = await fetch(CONSTANTS.KV_PRX_URL);
    if (kvPrx.status == 200) {
        return await kvPrx.json();
    } else {
        return {};
    }
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const upgradeHeader = request.headers.get("Upgrade");

        if (upgradeHeader === "websocket") {
            const prxMatch = url.pathname.match(/^\\/(.+[:=-]\\d+)$/);
            const workerDomain = url.hostname;

            if (url.pathname.length === 3 || url.pathname.match(",")) {
                const prxKeys = url.pathname.replace("/", "").toUpperCase().split(",");
                const prxKey = prxKeys[Math.floor(Math.random() * prxKeys.length)];

                const kvPrx = await getKVPrxList();
                if (kvPrx[prxKey] && kvPrx[prxKey].length > 0) {
                    prxIP = kvPrx[prxKey][Math.floor(Math.random() * kvPrx[prxKey].length)];
                } else {
                    return new Response("No proxy found", { status: 404 });
                }
                return await websocketHandler(request, workerDomain);

            } else if (prxMatch) {
                prxIP = prxMatch[1];
                return await websocketHandler(request, workerDomain);
            }
            return new Response("Invalid VLESS Path", { status: 400 });
        }

        return new Response("Nautica VPN Node Running.", { status: 200 });
    }
};

// --- WEBSOCKET HANDLER LOGIC ---
async function websocketHandler(request, serviceName) {
    const webSocketPair = new WebSocketPair();
    const [client, webSocket] = Object.values(webSocketPair);
    webSocket.accept();

    let addressLog = "";
    let portLog = "";
    const log = (info, event) => {
        console.log(\`[\${addressLog}:\${portLog}] \${info}\`, event || "");
    };
    const earlyDataHeader = request.headers.get("sec-websocket-protocol") || "";
    const readableWebSocketStream = makeReadableWebSocketStream(webSocket, earlyDataHeader, log);

    let remoteSocketWrapper = { value: null };
    let isDNS = false;

    readableWebSocketStream.pipeTo(new WritableStream({
        async write(chunk, controller) {
            if (isDNS) {
                return handleUDPOutbound(CONSTANTS.DNS_SERVER_ADDRESS, CONSTANTS.DNS_SERVER_PORT, chunk, webSocket, null, log, CONSTANTS.RELAY_SERVER_UDP);
            }
            if (remoteSocketWrapper.value) {
                const writer = (remoteSocketWrapper.value).writable.getWriter();
                await writer.write(chunk);
                writer.releaseLock();
                return;
            }

            const protocol = await protocolSniffer(chunk);
            let protocolHeader;

            if (protocol === atob(horse)) {
                protocolHeader = readHorseHeader(chunk);
            } else if (protocol === atob(flash)) {
                protocolHeader = readFlashHeader(chunk);
            } else {
                protocolHeader = readSsHeader(chunk);
            }

            if (!protocolHeader) throw new Error("No header parsed");

            addressLog = protocolHeader.addressRemote;
            portLog = \`\${protocolHeader.portRemote} -> \${protocolHeader.isUDP ? "UDP" : "TCP"}\`;

            if (protocolHeader.hasError) throw new Error(protocolHeader.message);

            if (protocolHeader.isUDP) {
                if (protocolHeader.portRemote === 53) {
                    isDNS = true;
                    return handleUDPOutbound(CONSTANTS.DNS_SERVER_ADDRESS, CONSTANTS.DNS_SERVER_PORT, chunk, webSocket, protocolHeader.version, log, CONSTANTS.RELAY_SERVER_UDP);
                }
                return handleUDPOutbound(protocolHeader.addressRemote, protocolHeader.portRemote, chunk, webSocket, protocolHeader.version, log, CONSTANTS.RELAY_SERVER_UDP);
            }

            handleTCPOutBound(remoteSocketWrapper, protocolHeader.addressRemote, protocolHeader.portRemote, protocolHeader.rawClientData, webSocket, protocolHeader.version, log);
        },
        close() { log(\`readableWebSocketStream is close\`); },
        abort(reason) { log(\`readableWebSocketStream is abort\`, JSON.stringify(reason)); },
    })).catch((err) => log("readableWebSocketStream pipeTo error", err));

    return new Response(null, { status: 101, webSocket: client });
}

async function protocolSniffer(buffer) {
    if (buffer.byteLength >= 62) {
        const horseDelimiter = new Uint8Array(buffer.slice(56, 60));
        if (horseDelimiter[0] === 0x0d && horseDelimiter[1] === 0x0a) {
            if (horseDelimiter[2] === 0x01 || horseDelimiter[2] === 0x03 || horseDelimiter[2] === 0x7f) {
                if (horseDelimiter[3] === 0x01 || horseDelimiter[3] === 0x03 || horseDelimiter[3] === 0x04) {
                    return atob(horse);
                }
            }
        }
    }
    const flashDelimiter = new Uint8Array(buffer.slice(1, 17));
    if (arrayBufferToHex(flashDelimiter).match(/^[0-9a-f]{8}[0-9a-f]{4}4[0-9a-f]{3}[89ab][0-9a-f]{3}[0-9a-f]{12}$/i)) {
        return atob(flash);
    }
    return "ss";
}

async function handleTCPOutBound(remoteSocket, addressRemote, portRemote, rawClientData, webSocket, responseHeader, log) {
    async function connectAndWrite(address, port) {
        const tcpSocket = connect({ hostname: address, port: port });
        remoteSocket.value = tcpSocket;
        log(\`connected to \${address}:\${port}\`);
        const writer = tcpSocket.writable.getWriter();
        await writer.write(rawClientData);
        writer.releaseLock();
        return tcpSocket;
    }

    async function retry() {
        const tcpSocket = await connectAndWrite(prxIP.split(/[:=-]/)[0] || addressRemote, parseInt(prxIP.split(/[:=-]/)[1]) || portRemote);
        tcpSocket.closed.catch((error) => console.log("retry tcpSocket closed error", error)).finally(() => safeCloseWebSocket(webSocket));
        remoteSocketToWS(tcpSocket, webSocket, responseHeader, null, log);
    }

    const tcpSocket = await connectAndWrite(addressRemote, portRemote);
    remoteSocketToWS(tcpSocket, webSocket, responseHeader, retry, log);
}

async function handleUDPOutbound(targetAddress, targetPort, dataChunk, webSocket, responseHeader, log, relay) {
    try {
        let protocolHeader = responseHeader;
        const tcpSocket = connect({ hostname: relay.host, port: relay.port });
        const header = \`udp:\${targetAddress}:\${targetPort}\`;
        const headerBuffer = new TextEncoder().encode(header);
        const separator = new Uint8Array([0x7c]);
        const relayMessage = new Uint8Array(headerBuffer.length + separator.length + dataChunk.byteLength);
        relayMessage.set(headerBuffer, 0);
        relayMessage.set(separator, headerBuffer.length);
        relayMessage.set(new Uint8Array(dataChunk), headerBuffer.length + separator.length);

        const writer = tcpSocket.writable.getWriter();
        await writer.write(relayMessage);
        writer.releaseLock();

        await tcpSocket.readable.pipeTo(new WritableStream({
            async write(chunk) {
                if (webSocket.readyState === WS_READY_STATE_OPEN) {
                    if (protocolHeader) {
                        webSocket.send(await new Blob([protocolHeader, chunk]).arrayBuffer());
                        protocolHeader = null;
                    } else {
                        webSocket.send(chunk);
                    }
                }
            },
            close() { log(\`UDP connection to \${targetAddress} closed\`); },
            abort(reason) { console.error(\`UDP connection aborted due to \${reason}\`); },
        }));
    } catch (e) {
        console.error(\`Error while handling UDP outbound: \${e.message}\`);
    }
}

function makeReadableWebSocketStream(webSocketServer, earlyDataHeader, log) {
    let readableStreamCancel = false;
    const stream = new ReadableStream({
        start(controller) {
            webSocketServer.addEventListener("message", (event) => {
                if (readableStreamCancel) return;
                const message = event.data;
                controller.enqueue(message);
            });
            webSocketServer.addEventListener("close", () => {
                safeCloseWebSocket(webSocketServer);
                if (readableStreamCancel) return;
                controller.close();
            });
            webSocketServer.addEventListener("error", (err) => {
                log("webSocketServer has error");
                controller.error(err);
            });
            const { earlyData, error } = base64ToArrayBuffer(earlyDataHeader);
            if (error) {
                controller.error(error);
            } else if (earlyData) {
                controller.enqueue(earlyData);
            }
        },
        pull(controller) { },
        cancel(reason) {
            if (readableStreamCancel) return;
            log(\`ReadableStream was canceled, due to \${reason}\`);
            readableStreamCancel = true;
            safeCloseWebSocket(webSocketServer);
        },
    });
    return stream;
}

function readSsHeader(ssBuffer) {
    const view = new DataView(ssBuffer);
    const addressType = view.getUint8(0);
    let addressLength = 0;
    let addressValueIndex = 1;
    let addressValue = "";

    switch (addressType) {
        case 1: addressLength = 4; addressValue = new Uint8Array(ssBuffer.slice(addressValueIndex, addressValueIndex + addressLength)).join("."); break;
        case 3: addressLength = new Uint8Array(ssBuffer.slice(addressValueIndex, addressValueIndex + 1))[0]; addressValueIndex += 1; addressValue = new TextDecoder().decode(ssBuffer.slice(addressValueIndex, addressValueIndex + addressLength)); break;
        case 4: addressLength = 16; const dataView = new DataView(ssBuffer.slice(addressValueIndex, addressValueIndex + addressLength)); const ipv6 = []; for (let i = 0; i < 8; i++) ipv6.push(dataView.getUint16(i * 2).toString(16)); addressValue = ipv6.join(":"); break;
        default: return { hasError: true, message: \`Invalid addressType for SS: \${addressType}\` };
    }

    if (!addressValue) return { hasError: true, message: \`Destination address empty, address type is: \${addressType}\` };

    const portIndex = addressValueIndex + addressLength;
    const portBuffer = ssBuffer.slice(portIndex, portIndex + 2);
    const portRemote = new DataView(portBuffer).getUint16(0);
    return { hasError: false, addressRemote: addressValue, addressType: addressType, portRemote: portRemote, rawDataIndex: portIndex + 2, rawClientData: ssBuffer.slice(portIndex + 2), version: null, isUDP: portRemote == 53 };
}

function readFlashHeader(buffer) {
    const version = new Uint8Array(buffer.slice(0, 1));
    let isUDP = false;
    const optLength = new Uint8Array(buffer.slice(17, 18))[0];
    const cmd = new Uint8Array(buffer.slice(18 + optLength, 18 + optLength + 1))[0];
    if (cmd === 2) isUDP = true;

    const portIndex = 18 + optLength + 1;
    const portBuffer = buffer.slice(portIndex, portIndex + 2);
    const portRemote = new DataView(portBuffer).getUint16(0);
    let addressIndex = portIndex + 2;
    const addressBuffer = new Uint8Array(buffer.slice(addressIndex, addressIndex + 1));
    const addressType = addressBuffer[0];
    let addressLength = 0;
    let addressValueIndex = addressIndex + 1;
    let addressValue = "";

    switch (addressType) {
        case 1: addressLength = 4; addressValue = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + addressLength)).join("."); break;
        case 2: addressLength = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + 1))[0]; addressValueIndex += 1; addressValue = new TextDecoder().decode(buffer.slice(addressValueIndex, addressValueIndex + addressLength)); break;
        case 3: addressLength = 16; const dataView = new DataView(buffer.slice(addressValueIndex, addressValueIndex + addressLength)); const ipv6 = []; for (let i = 0; i < 8; i++) ipv6.push(dataView.getUint16(i * 2).toString(16)); addressValue = ipv6.join(":"); break;
        default: return { hasError: true, message: \`invild  addressType is \${addressType}\` };
    }
    if (!addressValue) return { hasError: true, message: \`addressValue is empty, addressType is \${addressType}\` };

    return { hasError: false, addressRemote: addressValue, addressType: addressType, portRemote: portRemote, rawDataIndex: addressValueIndex + addressLength, rawClientData: buffer.slice(addressValueIndex + addressLength), version: new Uint8Array([version[0], 0]), isUDP: isUDP };
}

function readHorseHeader(buffer) {
    const dataBuffer = buffer.slice(58);
    if (dataBuffer.byteLength < 6) return { hasError: true, message: "invalid request data" };
    let isUDP = false;
    const view = new DataView(dataBuffer);
    const cmd = view.getUint8(0);
    if (cmd == 3) isUDP = true;
    else if (cmd != 1) { /* error/throw */ }

    let addressType = view.getUint8(1);
    let addressLength = 0;
    let addressValueIndex = 2;
    let addressValue = "";
    switch (addressType) {
        case 1: addressLength = 4; addressValue = new Uint8Array(dataBuffer.slice(addressValueIndex, addressValueIndex + addressLength)).join("."); break;
        case 3: addressLength = new Uint8Array(dataBuffer.slice(addressValueIndex, addressValueIndex + 1))[0]; addressValueIndex += 1; addressValue = new TextDecoder().decode(dataBuffer.slice(addressValueIndex, addressValueIndex + addressLength)); break;
        case 4: addressLength = 16; const dataView = new DataView(dataBuffer.slice(addressValueIndex, addressValueIndex + addressLength)); const ipv6 = []; for (let i = 0; i < 8; i++) ipv6.push(dataView.getUint16(i * 2).toString(16)); addressValue = ipv6.join(":"); break;
        default: return { hasError: true, message: \`invalid addressType is \${addressType}\` };
    }
    if (!addressValue) return { hasError: true, message: \`address is empty, addressType is \${addressType}\` };

    const portIndex = addressValueIndex + addressLength;
    const portBuffer = dataBuffer.slice(portIndex, portIndex + 2);
    const portRemote = new DataView(portBuffer).getUint16(0);
    return { hasError: false, addressRemote: addressValue, addressType: addressType, portRemote: portRemote, rawDataIndex: portIndex + 4, rawClientData: dataBuffer.slice(portIndex + 4), version: null, isUDP: isUDP };
}

async function remoteSocketToWS(remoteSocket, webSocket, responseHeader, retry, log) {
    let header = responseHeader;
    let hasIncomingData = false;
    await remoteSocket.readable.pipeTo(new WritableStream({
        start() { },
        async write(chunk, controller) {
            hasIncomingData = true;
            if (webSocket.readyState !== WS_READY_STATE_OPEN) controller.error("webSocket.readyState is not open, maybe close");
            if (header) { webSocket.send(await new Blob([header, chunk]).arrayBuffer()); header = null; }
            else { webSocket.send(chunk); }
        },
        close() { log(\`remoteConnection!.readable is close with hasIncomingData is \${hasIncomingData}\`); },
        abort(reason) { console.error(\`remoteConnection!.readable abort\`, reason); },
    })).catch((error) => { console.error(\`remoteSocketToWS has exception \`, error.stack || error); safeCloseWebSocket(webSocket); });
    if (hasIncomingData === false && retry) { log(\`retry\`); retry(); }
}

function safeCloseWebSocket(socket) {
    try { if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) socket.close(); }
    catch (error) { console.error("safeCloseWebSocket error", error); }
}
`;
