// index.js - Main WhatsApp Bot with Auto-Pull
require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const { encodeSession, decodeSession, hasSession, SESSION_PREFIX } = require('./lib/session');
const decryptors = require('./decryptors');
const Updater = require('./lib/updater');

// ============= CONFIG =============
const SESSION_DIR = path.join(__dirname, 'baileys_auth');
const PROCESSED_DIR = path.join(__dirname, 'processed');

// Supported formats
const SUPPORTED_EXTS = {
    '.hc': 'HTTP Custom',
    '.dark': 'Dark Tunnel',
    '.ehi': 'HTTP Injector',
    '.npvt': 'NPV Tunnel',
    '.ssc': 'SSH Custom'
};

// ============= UPDATER =============
const updater = new Updater();

// ============= CONFIG GENERATOR =============
function generateImportableConfig(decryptedText, ext) {
    // Try to extract JSON
    let jsonData = null;
    try {
        const match = decryptedText.match(/\{[\s\S]*\}/);
        if (match) {
            jsonData = JSON.parse(match[0]);
        }
    } catch (e) {}

    if (!jsonData) {
        return {
            filename: `decrypted_config.txt`,
            content: decryptedText,
            instructions: 'Decrypted config as text file'
        };
    }

    const generators = {
        '.hc': () => {
            const config = jsonData.Config || jsonData;
            const content = JSON.stringify({
                name: config.name || 'Custom Config',
                payload: config.payload || '',
                proxy: config.proxy || '',
                sni: config.sni || '',
                host: config.host || '',
                port: config.port || '',
                username: config.username || '',
                password: config.password || '',
                expiryTime: config.expiryTime || '',
                note: config.note || '',
                version: config.version || '2.0',
            }, null, 2);
            return {
                filename: `${config.name || 'config'}.hc.txt`,
                content: content,
                instructions: 'Copy content to create .hc file (base64 encoded)'
            };
        },
        '.dark': () => {
            const config = {};
            const fields = ['server', 'host', 'address', 'port', 'username', 'password', 'encryption', 'protocol'];
            for (const field of fields) {
                for (const [k, v] of Object.entries(jsonData)) {
                    if (k.toLowerCase().includes(field) && v) {
                        config[field] = v;
                        break;
                    }
                    if (typeof v === 'object' && v !== null) {
                        for (const [subK, subV] of Object.entries(v)) {
                            if (subK.toLowerCase().includes(field) && subV) {
                                config[field] = subV;
                                break;
                            }
                        }
                    }
                }
            }
            return {
                filename: 'config.dark.txt',
                content: JSON.stringify(config, null, 2),
                instructions: 'Copy content to create .dark file'
            };
        },
        '.ehi': () => {
            const config = {
                payload: jsonData.payload || '',
                proxy: jsonData.proxy || '',
                host: jsonData.host || '',
                port: jsonData.port || '',
                username: jsonData.username || '',
                password: jsonData.password || '',
                method: jsonData.method || '',
                filter: jsonData.filter || '',
            };
            return {
                filename: 'config.ehi.txt',
                content: JSON.stringify(config, null, 2),
                instructions: 'Copy content to create .ehi file (base64 encoded)'
            };
        },
        '.ssc': () => {
            const config = {
                ADDRESS: jsonData.ADDRESS || jsonData.address || '',
                PORT: jsonData.PORT || jsonData.port || '',
                USERNAME: jsonData.USERNAME || jsonData.username || '',
                PASSWORD: jsonData.PASSWORD || jsonData.password || '',
                PAYLOAD: jsonData.PAYLOAD || jsonData.payload || '',
                PROXY: jsonData.PROXY || jsonData.proxy || '',
                ENCRYPTION: jsonData.ENCRYPTION || jsonData.encryption || '',
            };
            return {
                filename: 'config.ssc.txt',
                content: JSON.stringify(config, null, 2),
                instructions: 'Copy content to create .ssc file'
            };
        },
        '.npvt': () => {
            return {
                filename: 'config.npvt.txt',
                content: JSON.stringify(jsonData, null, 2),
                instructions: 'Copy content to create .npvt file'
            };
        }
    };

    const generator = generators[ext];
    if (!generator) {
        return {
            filename: 'decrypted_config.txt',
            content: JSON.stringify(jsonData, null, 2),
            instructions: 'Decrypted config as JSON'
        };
    }
    
    return generator();
}

// ============= WHATSAPP BOT =============
async function startBot() {
    console.log('🤖 Starting WhatsApp VPN Decryptor Bot (Pure Node.js)');
    console.log('=' .repeat(50));

    // Check for session
    if (!hasSession()) {
        console.log('❌ No session found!');
        console.log('Please run: npm run session');
        process.exit(1);
    }

    // Ensure directories exist
    if (!fs.existsSync(PROCESSED_DIR)) {
        fs.mkdirSync(PROCESSED_DIR, { recursive: true });
    }

    // Get Baileys version
    const { version } = await fetchLatestBaileysVersion();
    console.log(`📱 Baileys version: ${version}`);

    // Create WhatsApp socket
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    
    const sock = makeWASocket({
        version,
        auth: state,
        logger: P({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['VPN Decryptor', 'Chrome', '120.0.0.0'],
    });

    // Connection handler
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'connecting') {
            console.log('🔄 Connecting...');
        }

        if (connection === 'open') {
            console.log('✅ Connected to WhatsApp!');
            console.log('📨 Waiting for messages...');
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === DisconnectReason.loggedOut) {
                console.log('❌ Logged out. Please re-sync session.');
            } else {
                console.log('🔄 Reconnecting...');
                setTimeout(startBot, 5000);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // ============= MESSAGE HANDLER =============
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;
        if (msg.key.fromMe) return;
        
        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');

        try {
            const textMsg = msg.message.conversation || 
                           msg.message.extendedTextMessage?.text ||
                           msg.message.imageMessage?.caption ||
                           msg.message.documentMessage?.caption ||
                           '';

            if (textMsg) {
                const lowerText = textMsg.toLowerCase().trim();
                
                if (lowerText === 'help' || lowerText === '/help') {
                    const helpText = `
🤖 *VPN Decryptor Bot*

*Supported formats:*
${Object.entries(SUPPORTED_EXTS).map(([ext, name]) => `• ${ext} - ${name}`).join('\n')}

*Commands:*
• Send config file → Decrypt it
• Reply "generate" → Create importable config file
• Reply "help" → Show this message

*How to use:*
1. Send me a VPN config file
2. I'll decrypt and show the details
3. Reply with "generate" to get a new config file
                    `;
                    await sock.sendMessage(from, { text: helpText });
                    return;
                }
                
                if (lowerText === 'generate' || lowerText === '/generate') {
                    const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (quotedMsg) {
                        const doc = quotedMsg.documentMessage || quotedMsg.imageMessage || quotedMsg.videoMessage;
                        if (doc) {
                            const fileName = doc.fileName || 'file';
                            const ext = Object.keys(SUPPORTED_EXTS).find(e => fileName.toLowerCase().includes(e));
                            
                            if (ext) {
                                await sock.sendMessage(from, {
                                    text: `🔄 Generating config from ${fileName}...`
                                });
                                
                                const media = await sock.downloadMediaMessage(msg);
                                if (media) {
                                    const tempPath = path.join(PROCESSED_DIR, `temp_${Date.now()}${ext}`);
                                    fs.writeFileSync(tempPath, media);
                                    
                                    const decrypted = decryptors.decrypt(media, ext);
                                    fs.unlinkSync(tempPath);
                                    
                                    if (decrypted) {
                                        const generated = generateImportableConfig(decrypted, ext);
                                        if (generated) {
                                            const caption = `✅ *Config Generated!*\n\n📁 ${generated.filename}\n💡 ${generated.instructions}`;
                                            await sock.sendMessage(from, {
                                                text: `${caption}\n\n\`\`\`\n${generated.content}\n\`\`\``
                                            });
                                            return;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    await sock.sendMessage(from, {
                        text: `❌ No file found to generate from.\n\nPlease send a config file first, then reply with "generate".`
                    });
                    return;
                }
            }

            const doc = msg.message.documentMessage;
            if (doc) {
                const fileName = doc.fileName || 'file';
                const ext = Object.keys(SUPPORTED_EXTS).find(e => fileName.toLowerCase().includes(e));
                
                if (!ext) {
                    await sock.sendMessage(from, {
                        text: `❌ Unsupported file type: ${path.extname(fileName)}\n\nSupported: ${Object.keys(SUPPORTED_EXTS).join(', ')}`
                    });
                    return;
                }

                await sock.sendMessage(from, {
                    text: `🔓 Decrypting ${fileName}...`
                });

                const media = await sock.downloadMediaMessage(msg);
                if (!media) {
                    await sock.sendMessage(from, { text: '❌ Failed to download file.' });
                    return;
                }

                const decrypted = decryptors.decrypt(media, ext);
                if (!decrypted) {
                    await sock.sendMessage(from, {
                        text: `❌ Decryption failed. File might be corrupted or unsupported.`
                    });
                    return;
                }

                const responseText = `✅ *${SUPPORTED_EXTS[ext]} Decrypted!*\n\n${decrypted}\n\n📝 Reply with "generate" to create an importable config file.`;
                
                if (responseText.length > 65536) {
                    const chunks = responseText.match(/[\s\S]{1,65000}/g) || [responseText];
                    for (const chunk of chunks) {
                        await sock.sendMessage(from, { text: chunk });
                    }
                } else {
                    await sock.sendMessage(from, { text: responseText });
                }
                return;
            }

        } catch (error) {
            console.error('Message handling error:', error);
            await sock.sendMessage(from, {
                text: `❌ Error: ${error.message}`
            });
        }
    });

    return sock;
}

// ============= MAIN =============
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === 'generate' || command === 'gen') {
        await require('./lib/session').encodeSession();
        console.log('✅ Session generated!');
        return;
    }

    if (command === 'restore' && args[1]) {
        require('./lib/session').decodeSession(args[1]);
        console.log('✅ Session restored!');
        return;
    }

    // ===== CHECK FOR UPDATES =====
    console.log('📡 Checking for updates...');
    
    // Save current package.json for comparison
    await updater.savePackageForComparison();
    
    // Check and pull updates
    const updated = await updater.checkAndPull();
    
    if (updated) {
        console.log('🔄 Updates applied! Restarting...');
        process.exit(0); // Will be restarted by PM2 or systemd
    }

    // Start bot
    await startBot();
}

// Handle process signals
process.on('SIGINT', () => {
    console.log('\n👋 Bot stopped.');
    process.exit(0);
});

main().catch(console.error);