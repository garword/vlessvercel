
import QRCode from "qrcode";

export const ITEMS_PER_PAGE = 5;

export function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export function shuffleArray(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export function getFlagEmoji(countryCode: string) {
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}

export async function generateQRCode(text: string): Promise<Buffer> {
    try {
        // Return Buffer directly
        return await QRCode.toBuffer(text, {
            errorCorrectionLevel: 'M',
            margin: 4,
            width: 500
        });
    } catch (err) {
        console.error("QR Code Gen Error:", err);
        throw err;
    }
}
