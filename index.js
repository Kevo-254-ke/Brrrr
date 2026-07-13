// index.js - Main WhatsApp Bot with Command System
require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const { encodeSession, decodeSession, hasSession, SESSION_PREFIX } = require('./lib/session');

// ============= CONFIG =============
const SESSION_DIR = path.join(__dirname, 'baileys_auth');
const PROCESSED_DIR = path.join(__dirname, 'processed');
const PREFIX = process.env.PREFIX || '.';
const OWNER_NUMBER = process.env.OWNER_NUMBER || '';

// ============= LOAD DECRYPTORS =============
const decryptors = require('./decryptors');

// ============= SUPPORTED FORMATS =============
const SUPPORTED_EXTS = {
    '.hc': 'HTTP Custom',
    '.dark': 'Dark Tunnel',
    '.ehi': 'HTTP Injector',
    '.npvt': 'NPV Tunnel',
    '.ssc': 'SSH Custom'
};

// ============= DECRYPTED CACHE =============
const decryptedCache = new Map();

// ============= CONFIG GENERATOR =============
function generateImportableConfig(decryptedText, ext) {
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
            if (Object.keys(config).length === 0) return null;
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

// ============= AUTO-RESTORE SESSION =============
function autoRestoreSession() {
    const sessionId = process.env.SESSION_ID;
    
    if (!sessionId) {
        console.log('⚠️ No SESSION_ID found in .env');
        console.log('📝 Please run: npm run session');
        console.log('Then add SESSION_ID to .env');
        return false;
    }

    if (hasSession()) {
        console.log('✅ Session already exists in baileys_auth/');
        return true;
    }

    console.log('📦 No session found. Attempting to restore from SESSION_ID...');
    
    try {
        decodeSession(sessionId);
        console.log('✅ Session restored successfully!');
        return true;
    } catch (error) {
        console.error('❌ Failed to restore session:', error.message);
        return false;
    }
}

// ============= CHECK IF SENDER IS OWNER =============
function isOwner(sender) {
    if (!OWNER_NUMBER) return false;
    const senderNum = sender.replace(/@.+$/, '').replace(/\D/g, '');
    const ownerNum = OWNER_NUMBER.replace(/\D/g, '');
    return senderNum === ownerNum;
}

// ============= HANDLE DECRYPT COMMAND =============
async function handleDecryptCommand(ctx) {
    const quotedMsg = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    if (!quotedMsg) {
        return ctx.reply(
            `🔓 *VPN Decryptor*\n\n` +
            `Reply to a VPN config file with \`${PREFIX}decrypt\` to decode it.\n\n` +
            `📁 *Supported formats:*\n` +
            `${Object.entries(SUPPORTED_EXTS).map(([ext, name]) => `• ${ext} → ${name}`).join('\n')}\n\n` +
            `📝 *Max file size:* 2 MB`
        );
    }

    const document = quotedMsg.documentMessage;
    if (!document) {
        return ctx.reply(`❌ Please reply to a document file.`);
    }

    const fileName = document.fileName || 'file';
    const fileSize = document.fileLength || 0;
    const ext = Object.keys(SUPPORTED_EXTS).find(e => fileName.toLowerCase().includes(e));

    if (!ext) {
        return ctx.reply(
            `❌ *Unsupported file type*\n\n` +
            `Supported: ${Object.keys(SUPPORTED_EXTS).join(', ')}`
        );
    }

    if (fileSize > 2 * 1024 * 1024) {
        const sizeKB = (fileSize / 1024).toFixed(1);
        return ctx.reply(`❌ File too large: *${sizeKB} KB*\nMax: 2 MB`);
    }

    await ctx.reply(`⏳ Decrypting \`${fileName}\`...`);

    try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const fileBuffer = await downloadMediaMessage({ message: quotedMsg }, 'buffer', {});
        
        if (!fileBuffer) {
            return ctx.reply('❌ Failed to download file.');
        }

        const decrypted = decryptors.decrypt(fileBuffer, ext);
        
        if (!decrypted) {
            return ctx.reply(`❌ Decryption failed for \`${fileName}\``);
        }

        // Store in cache for "generate" command
        const cacheKey = ctx.sender;
        decryptedCache.set(cacheKey, {
            decrypted: decrypted,
            ext: ext,
            fileName: fileName,
            timestamp: Date.now()
        });

        const responseText = `✅ *${SUPPORTED_EXTS[ext]} Decrypted!*\n\n${decrypted}\n\n📝 Reply with "generate" to create an importable config file.`;
        
        if (responseText.length > 65536) {
            const chunks = responseText.match(/[\s\S]{1,65000}/g) || [responseText];
            for (const chunk of chunks) {
                await ctx.reply(chunk);
            }
        } else {
            await ctx.reply(responseText);
        }

    } catch (err) {
        console.error('[decrypt] Error:', err.message);
        await ctx.reply(`❌ Error: ${err.message}`);
    }
}

// ============= HANDLE GENERATE COMMAND =============
async function handleGenerateCommand(ctx) {
    const cacheKey = ctx.sender;
    const cached = decryptedCache.get(cacheKey);
    
    if (!cached) {
        return ctx.reply(
            `❌ *No decrypted data found!*\n\n` +
            `Please decrypt a file first:\n` +
            `${PREFIX}decrypt (reply to a config file)`
        );
    }

    if (Date.now() - cached.timestamp > 30 * 60 * 1000) {
        decryptedCache.delete(cacheKey);
        return ctx.reply(`⏰ *Cache expired!* (30 minutes)\nPlease decrypt again.`);
    }

    await ctx.reply(`🔄 Generating config from ${cached.fileName}...`);

    const generated = generateImportableConfig(cached.decrypted, cached.ext);
    
    if (!generated) {
        return ctx.reply(`❌ Cannot generate config from this data.`);
    }

    const content = typeof generated.content === 'string' 
        ? Buffer.from(generated.content, 'utf-8') 
        : generated.content;

    await ctx.sock.sendMessage(ctx.from, {
        document: content,
        fileName: generated.filename,
        caption: `✅ *Config Generated!*\n\n📁 ${generated.filename}\n💡 ${generated.instructions}`,
        mimetype: 'text/plain'
    }, { quoted: ctx.msg });

    decryptedCache.delete(cacheKey);
}

// ============= HANDLE HELP COMMAND =============
async function handleHelpCommand(ctx) {
    const helpText = `
🤖 *VPN Decryptor Bot*

*Commands:*
${PREFIX}decrypt - Decrypt a VPN config file (reply to file)
${PREFIX}generate - Generate importable config from decrypted data
${PREFIX}help - Show this message

*Supported formats:*
${Object.entries(SUPPORTED_EXTS).map(([ext, name]) => `• ${ext} → ${name}`).join('\n')}

*How to use:*
1. Reply to a config file with: ${PREFIX}decrypt
2. Reply with: ${PREFIX}generate to get importable config

*Example:*
You: [sends config.hc]
You: ${PREFIX}decrypt (reply to the file)
Bot: [shows decrypted data]
You: ${PREFIX}generate
Bot: [sends config.hc.txt]
    `;
    await ctx.reply(helpText);
}

// ============= WHATSAPP BOT =============
async function startBot() {
    console.log('🤖 Starting WhatsApp VPN Decryptor Bot');
    console.log('=' .repeat(50));

    // Auto-restore session
    if (!autoRestoreSession()) {
        console.log('\n❌ Cannot start bot without a valid session.');
        console.log('Please run: npm run session');
        console.log('Then add SESSION_ID to .env');
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
        syncFullHistory: false,
        markOnlineOnConnect: true,
    });

    // ============= CONNECTION HANDLER =============
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'connecting') {
            console.log('🔄 Connecting...');
        }

        if (connection === 'open') {
            console.log('✅ Connected to WhatsApp!');
            console.log(`📨 Prefix: ${PREFIX}`);
            console.log(`👑 Owner: ${OWNER_NUMBER || 'Not set'}`);
            console.log('📨 Waiting for messages...');
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === DisconnectReason.loggedOut) {
                console.log('❌ Logged out. Please re-sync session.');
            } else {
                console.log('🔄 Reconnecting in 5 seconds...');
                setTimeout(startBot, 5000);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // ============= MESSAGE HANDLER =============
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg || !msg.message) return;
            if (msg.key.fromMe) return;
            
            const from = msg.key.remoteJid;
            const sender = msg.key.participant || from;
            
            // Check if sender is owner
            if (!isOwner(sender)) {
                await sock.sendMessage(from, { 
                    text: `❌ *Access Denied*\n\nYou are not authorized to use this bot.\n\nContact: @HABIBI_1ST` 
                });
                return;
            }

            // Extract text message
            const textMsg = msg.message.conversation || 
                           msg.message.extendedTextMessage?.text ||
                           msg.message.imageMessage?.caption ||
                           msg.message.documentMessage?.caption ||
                           '';

            // Create context for commands
            const ctx = {
                sock: sock,
                msg: msg,
                from: from,
                sender: sender,
                isGroup: from.endsWith('@g.us'),
                reply: (text) => sock.sendMessage(from, { text: text }, { quoted: msg }),
                prefix: PREFIX
            };

            // ===== COMMANDS =====
            if (textMsg) {
                const trimmed = textMsg.trim();
                
                // Help command
                if (trimmed === 'help' || trimmed === '/help' || trimmed === '?') {
                    await handleHelpCommand(ctx);
                    return;
                }
                
                // Decrypt command
                if (trimmed === `${PREFIX}decrypt` || trimmed === `${PREFIX}dec`) {
                    await handleDecryptCommand(ctx);
                    return;
                }
                
                // Generate command
                if (trimmed === `${PREFIX}generate` || trimmed === `${PREFIX}gen`) {
                    await handleGenerateCommand(ctx);
                    return;
                }
            }

            // ===== AUTO-DETECT FILE (if no command, check for file) =====
            const doc = msg.message.documentMessage;
            if (doc) {
                const fileName = doc.fileName || 'file';
                const ext = Object.keys(SUPPORTED_EXTS).find(e => fileName.toLowerCase().includes(e));
                
                if (ext) {
                    // Auto-decrypt if file is sent without command
                    await ctx.reply(`🔓 Auto-decrypting ${fileName}...`);
                    
                    const { downloadMediaMessage } = require('@whiskeysockets/baileys');
                    const fileBuffer = await downloadMediaMessage({ message: msg.message }, 'buffer', {});
                    
                    if (fileBuffer) {
                        const decrypted = decryptors.decrypt(fileBuffer, ext);
                        if (decrypted) {
                            const cacheKey = sender;
                            decryptedCache.set(cacheKey, {
                                decrypted: decrypted,
                                ext: ext,
                                fileName: fileName,
                                timestamp: Date.now()
                            });
                            
                            const responseText = `✅ *${SUPPORTED_EXTS[ext]} Decrypted!*\n\n${decrypted}\n\n📝 Reply with "${PREFIX}generate" to create an importable config file.`;
                            
                            if (responseText.length > 65536) {
                                const chunks = responseText.match(/[\s\S]{1,65000}/g) || [responseText];
                                for (const chunk of chunks) {
                                    await ctx.reply(chunk);
                                }
                            } else {
                                await ctx.reply(responseText);
                            }
                        } else {
                            await ctx.reply(`❌ Decryption failed for ${fileName}`);
                        }
                    }
                }
            }

        } catch (error) {
            console.error('❌ Message handling error:', error);
            const from = msg?.key?.remoteJid;
            if (from) {
                await sock.sendMessage(from, {
                    text: `❌ Error: ${error.message}`
                });
            }
        }
    });

    console.log('✅ Bot is ready and listening for messages!');
    return sock;
}

// ============= MAIN =============
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === 'generate' || command === 'gen') {
        try {
            const sessionId = encodeSession();
            console.log('\n✅ Session generated!');
            console.log('=' .repeat(50));
            console.log(sessionId);
            console.log('=' .repeat(50));
            console.log('\n📌 Add this to your .env file:');
            console.log(`SESSION_ID=${sessionId}`);
            
            fs.writeFileSync('session_id.txt', sessionId);
            console.log('\n💾 Saved to session_id.txt');
        } catch (error) {
            console.error('❌ Failed to generate session:', error.message);
        }
        return;
    }

    if (command === 'restore' && args[1]) {
        try {
            decodeSession(args[1]);
            console.log('✅ Session restored!');
        } catch (error) {
            console.error('❌ Failed to restore session:', error.message);
        }
        return;
    }

    if (command === 'restore') {
        console.log('Usage: node index.js restore <SESSION_ID>');
        return;
    }

    // Start bot
    await startBot();
}

// Handle process signals
process.on('SIGINT', () => {
    console.log('\n👋 Bot stopped.');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
});

main().catch(console.error);