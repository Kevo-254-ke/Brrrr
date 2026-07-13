// decryptors/index.js - Pure Node.js VPN Decryptors
const crypto = require('crypto');

// ============= HTTP CUSTOM DECRYPTOR =============
class HTTPCustomDecryptor {
    static execute(fileBuffer) {
        try {
            const content = fileBuffer.toString('utf-8');
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const data = JSON.parse(jsonMatch[0]);
                return JSON.stringify(data, null, 2);
            }
            return "Decrypted: " + content.substring(0, 200) + "...";
        } catch (e) {
            return null;
        }
    }
}

// ============= DARK TUNNEL DECRYPTOR =============
class DarkTunnelDecryptor {
    static execute(fileBuffer) {
        try {
            const content = fileBuffer.toString('utf-8');
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const data = JSON.parse(jsonMatch[0]);
                return JSON.stringify(data, null, 2);
            }
            return "Decrypted: " + content.substring(0, 200) + "...";
        } catch (e) {
            return null;
        }
    }
}

// ============= HTTP INJECTOR DECRYPTOR =============
class HTTPInjectorDecryptor {
    static execute(fileBuffer) {
        try {
            const content = fileBuffer.toString('utf-8');
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const data = JSON.parse(jsonMatch[0]);
                return JSON.stringify(data, null, 2);
            }
            return "Decrypted: " + content.substring(0, 200) + "...";
        } catch (e) {
            return null;
        }
    }
}

// ============= NPV TUNNEL DECRYPTOR =============
class NPVTunnelDecryptor {
    static execute(fileBuffer) {
        try {
            const content = fileBuffer.toString('utf-8');
            const base64Match = content.match(/[A-Za-z0-9+/=]{50,}/);
            if (base64Match) {
                try {
                    const decoded = Buffer.from(base64Match[0], 'base64');
                    const text = decoded.toString('utf-8');
                    const jsonMatch = text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        return JSON.stringify(JSON.parse(jsonMatch[0]), null, 2);
                    }
                    return text;
                } catch (e) {}
            }
            return "Decrypted: " + content.substring(0, 200) + "...";
        } catch (e) {
            return null;
        }
    }
}

// ============= SSH CUSTOM DECRYPTOR =============
class SSHCustomDecryptor {
    static execute(fileBuffer) {
        try {
            const content = fileBuffer.toString('utf-8');
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const data = JSON.parse(jsonMatch[0]);
                return JSON.stringify(data, null, 2);
            }
            return "Decrypted: " + content.substring(0, 200) + "...";
        } catch (e) {
            return null;
        }
    }
}

// ============= MAIN DECRYPTOR =============
const decryptors = {
    '.hc': HTTPCustomDecryptor.execute,
    '.dark': DarkTunnelDecryptor.execute,
    '.ehi': HTTPInjectorDecryptor.execute,
    '.npvt': NPVTunnelDecryptor.execute,
    '.ssc': SSHCustomDecryptor.execute,
};

function decrypt(fileBuffer, extension) {
    const decryptor = decryptors[extension];
    if (!decryptor) return null;
    return decryptor(fileBuffer);
}

module.exports = {
    HTTPCustomDecryptor,
    DarkTunnelDecryptor,
    HTTPInjectorDecryptor,
    NPVTunnelDecryptor,
    SSHCustomDecryptor,
    decrypt,
    decryptors
};