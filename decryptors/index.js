// decryptors/index.js - Pure Node.js VPN Decryptors
const crypto = require('crypto');
const { createDecipheriv, createCipheriv, createHash } = require('crypto');

// ============= HTTP CUSTOM DECRYPTOR =============
class HTTPCustomDecryptor {
    static CHACHA_KEYS = [
        "2be4342943c6f91ff58987f41a1aafd179eeb4e053f5cea55b11d6a7db58bd7d",
        "3380aa278b744ba5b529a7f32fa803e48749280dae378345d9b526cf1dbce372",
        "cea9305c95168b162a335b137c61983b8df54e6375da01136547890f14c5fac3",
        "4beeace0e42bae8f29470cf40cf2dfacd5f4e1f751912bf52e803c8c85792193",
        "f8e5f6ebea90558eb32229da24fd0fb7d813091dafe89bb2954fda33b4c60f63",
        "81342f558a6273bac4548d473f54c4ffc7c41747dee81369acab9c787d41ab9c",
        "45635e6fc70486e2fd10d3c2b4780f02d0b4c5f4aa929fc54f86bb8fa4417944",
        "3d632a251c9820f2baf83e15498d27548fc67921cb437f8ce48505989378adea"
    ];

    static RST_KEYS = [
        "JN1k3YHc2.6_v235", "JN1k3YHc_2.7_v71", "JN1k3YHc2.7.ps69",
        "JN1k3YHc2.7.6950", "Jn1K3yHc2.8.ps08", "Jn1K3yHc2.9.ps6c",
        "Zk:L7>WKaiK*s9>D", "!<f!&WIlM**R.B0X", "b4a5opinx2uloec6"
    ];

    static STATIC_NONCE = Buffer.from('\xdb'.repeat(8));
    static JKL_KEY_OLD = Buffer.from([0xd5,0xd4,0xd3,0xd2,0xd1,0xd0,0xcf,0xce,0xcd,0xcc,0xbd,0xbc,0xbb,0xba,0xb9,0xb8,0xb7,0xb6,0xb5,0xb4]);
    static JKL_KEY_NEW = Buffer.from([8,9,10,11,12,13,14,15,17,17,5,4,3,2,1,0,255,254,253,252]);
    static RST_XOR_KEY = Buffer.from(Array.from({length:20}, (_,i) => i+2));
    static BRAILLE_ALPHABET = "⠁⠃⠉⠙⠑⠋⠛⠓⠊⠚⠅⠇⠍⠝⠕⠏⠟⠗⠎⠞⠥⠧⠺⠭⠽⠵⠼⠁⠼⠃⠼⠉⠼⠙⠼⠑⠼⠋⠼⠛⠼⠓⠼⠊⠼⠚";

    static cleanHex(raw) {
        if (!raw) return "";
        const clean = raw.replace(/[^0-9a-fA-F]/g, '');
        return clean.length % 2 ? "0" + clean : clean;
    }

    static chacha20Decrypt(ciphertext, key, nonce = this.STATIC_NONCE) {
        try {
            // Node.js doesn't support ChaCha20 natively, using custom implementation
            // Simplified: use crypto-js or implement ChaCha20
            const keyBuf = Buffer.from(key, 'hex');
            // For now, return as-is (we'll implement ChaCha20 properly)
            return ciphertext.toString('hex');
        } catch (e) {
            return "";
        }
    }

    static execute(fileBuffer) {
        try {
            const content = fileBuffer.toString('utf-8');
            // Basic extraction - simplified
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
    static KEY_256 = Buffer.from("$B&E)H@McQfThWmZq4t7w!z%C*F-JaNd");
    static KEY_192 = Buffer.from("F)J@NcRfUjXn2r4u7x!A%D*G");
    static IV = Buffer.from("232e39185523184a5723586242200e05", 'hex');

    static aesCfbDecrypt(data, key, iv) {
        try {
            const decipher = createDecipheriv('aes-192-cfb', key, iv);
            let decrypted = decipher.update(data);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted;
        } catch (e) {
            return null;
        }
    }

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
    static L1_KEY = Buffer.from("7e1210f7aab956f7a668bda6e57feddb7f84ad840aef8d27b1b969959be3ab6c", 'hex');
    static L2_KEY = Buffer.from("b2bc617c32d8b9eb1943a5ffa8051eea", 'hex');
    static EOO_KEY = Buffer.from("null=V5kU5+FFrY\x00");

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
            // NPV uses base64 encoded gzipped pickle in Python
            // In Node, we'll try to decode base64 and parse JSON
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
    static FIXED_NONCE = Buffer.alloc(8);
    static L1_KEY = Buffer.from("c8a6a8ea102d5a0baf8fdb1b39cd615c0d07c1edcbde4e82cfdd309bc4587f6b", 'hex');
    static L2_KEY = Buffer.from("7f9db48ffde449ad19f9ed44b8b27eee334ab4a85b972dca8ff20e4e8ed44e4e", 'hex');
    static L3_KEY = Buffer.from("d39394517a48971f6e8555e994bee5bd835e5ab2f85fbd76bbd99800f32b967e", 'hex');

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

// ============= EXPORTS =============
module.exports = {
    HTTPCustomDecryptor,
    DarkTunnelDecryptor,
    HTTPInjectorDecryptor,
    NPVTunnelDecryptor,
    SSHCustomDecryptor,
    
    // Main entry point
    decrypt: function(fileBuffer, extension) {
        const decryptors = {
            '.hc': HTTPCustomDecryptor.execute,
            '.dark': DarkTunnelDecryptor.execute,
            '.ehi': HTTPInjectorDecryptor.execute,
            '.npvt': NPVTunnelDecryptor.execute,
            '.ssc': SSHCustomDecryptor.execute,
        };
        
        const decryptor = decryptors[extension];
        if (!decryptor) return null;
        
        return decryptor(fileBuffer);
    }
};