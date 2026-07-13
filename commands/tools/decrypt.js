// commands/tools/decrypt.js
// WhatsApp VPN Config Decryptor - Decrypt .hc, .dark, .ehi, .npvt, .ssc files
'use strict';
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const dev = require('../../dev');
const decryptors = require('../../decryptors');

const description = 'Reply to a VPN config file (.hc, .dark, .ehi, .npvt, .ssc) to decrypt it';

// Supported formats
const SUPPORTED_EXTS = {
    '.hc': 'HTTP Custom',
    '.dark': 'Dark Tunnel',
    '.ehi': 'HTTP Injector',
    '.npvt': 'NPV Tunnel',
    '.ssc': 'SSH Custom'
};

// Max file size: 2MB
const MAX_FILE_BYTES = 2 * 1024 * 1024;

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

// ============= BUILD CAPTION =============
function buildCaption(fileName, ext, stats) {
    const bar = '▓'.repeat(10);
    const line = '━'.repeat(32);
    const formatName = SUPPORTED_EXTS[ext] || 'Unknown';
    
    return (
        `╔${line}╗\n` +
        `║  🔓  *${dev.botName} VPN DECRYPTOR*  🔓  ║\n` +
        `╚${line}╝\n\n` +
        `> 📄 *File:* \`${fileName}\`\n` +
        `> 🏷️ *Format:* ${formatName}\n` +
        `> 📊 *Size:* ${(stats.size / 1024).toFixed(1)} KB\n` +
        `> 🔑 *Status:* ✅ Decrypted\n\n` +
        `${bar}\n` +
        `🤖 *Powered by ${dev.botName} v${dev.version}*\n` +
        `👨‍💻 Dev: ${dev.devName}\n` +
        `${bar}\n\n` +
        `📝 *Reply with "generate" to create an importable config file*`
    );
}

// ============= COMMAND HANDLER =============
async function run(ctx) {
    const quotedMsg = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
    // Check if replying to a message
    if (!quotedMsg) {
        return ctx.reply(
            `🔓 *VPN Decryptor*\n\n` +
            `Reply to a VPN config file with \`${ctx.prefix}decrypt\` to decode it.\n\n` +
            `📁 *Supported formats:*\n` +
            `${Object.entries(SUPPORTED_EXTS).map(([ext, name]) => `• ${ext} → ${name}`).join('\n')}\n\n` +
            `📝 *Max file size:* 2 MB\n\n` +
            `_Your config will be decrypted and shown in detail._ 🔐`
        );
    }

    // Check if quoted message has a document
    const document = quotedMsg.documentMessage;
    if (!document) {
        return ctx.reply(`❌ Please reply to a document file (not an image or text).`);
    }

    const fileName = document.fileName || 'file';
    const fileSize = document.fileLength || 0;
    const ext = Object.keys(SUPPORTED_EXTS).find(e => fileName.toLowerCase().includes(e));

    // Check if supported format
    if (!ext) {
        const extName = path.extname(fileName);
        return ctx.reply(
            `❌ *Unsupported file type:* \`${extName || 'unknown'}\`\n\n` +
            `📁 *Supported formats:*\n` +
            `${Object.entries(SUPPORTED_EXTS).map(([e, name]) => `• ${e} → ${name}`).join('\n')}\n\n` +
            `_Send a valid VPN config file._ 🔐`
        );
    }

    // Check file size
    if (fileSize > MAX_FILE_BYTES) {
        const sizeKB = (fileSize / 1024).toFixed(1);
        return ctx.reply(
            `❌ *File too large!*\n\n` +
            `📦 Your file: *${sizeKB} KB*\n` +
            `🚫 Max allowed: *2 MB*\n\n` +
            `_Please compress or use a smaller file._ ✂️`
        );
    }

    await ctx.reply(
        `⏳ *Decrypting \`${fileName}\`...*\n\n` +
        `🔍 Analyzing file structure\n` +
        `🔓 Applying decryption algorithms\n` +
        `_Please wait, this might take a moment!_ ☕`
    );

    try {
        // Download the file
        const fileBuffer = await downloadMediaMessage({ message: quotedMsg }, 'buffer', {});
        
        if (!fileBuffer || fileBuffer.length === 0) {
            return ctx.reply('❌ Failed to download file. Please try again.');
        }

        // Decrypt using Node.js decryptors
        const decrypted = decryptors.decrypt(fileBuffer, ext);
        
        if (!decrypted) {
            return ctx.reply(
                `❌ *Decryption failed!*\n\n` +
                `The file \`${fileName}\` could not be decrypted.\n\n` +
                `Possible reasons:\n` +
                `• Corrupted file\n` +
                `• Unsupported version\n` +
                `• Password protected\n\n` +
                `_Try a different file or contact support._ 🆘`
            );
        }

        // Build response
        const caption = buildCaption(fileName, ext, { size: fileBuffer.length });
        const fullResponse = `${caption}\n\n\`\`\`\n${decrypted}\n\`\`\``;

        // Send response (split if too long)
        if (fullResponse.length > 65536) {
            // Send caption first
            await ctx.reply(caption);
            
            // Send decrypted data in chunks
            const chunks = decrypted.match(/[\s\S]{1,65000}/g) || [decrypted];
            for (const chunk of chunks) {
                await ctx.reply(`\`\`\`\n${chunk}\n\`\`\``);
            }
        } else {
            await ctx.reply(fullResponse);
        }

        // Store decrypted data for "generate" command
        if (ctx.sock && ctx.from) {
            const sessionKey = `decrypted_${ctx.sender}`;
            ctx.sock.decryptedCache = ctx.sock.decryptedCache || new Map();
            ctx.sock.decryptedCache.set(sessionKey, {
                decrypted: decrypted,
                ext: ext,
                fileName: fileName,
                timestamp: Date.now()
            });
        }

    } catch (err) {
        console.error('[decrypt] Error:', err.message);
        await ctx.reply(
            `❌ *Error during decryption:*\n\n` +
            `\`${err.message}\`\n\n` +
            `_Please try again or contact support._ 🆘`
        );
    }
}

// ============= GENERATE COMMAND =============
async function generateRun(ctx) {
    const sessionKey = `decrypted_${ctx.sender}`;
    const cached = ctx.sock?.decryptedCache?.get(sessionKey);
    
    if (!cached) {
        return ctx.reply(
            `❌ *No decrypted data found!*\n\n` +
            `Please decrypt a file first using:\n` +
            `\`${ctx.prefix}decrypt\` (reply to a config file)\n\n` +
            `_Then use this command to generate an importable config._ 🔐`
        );
    }

    // Check if cache expired (30 minutes)
    if (Date.now() - cached.timestamp > 30 * 60 * 1000) {
        ctx.sock.decryptedCache.delete(sessionKey);
        return ctx.reply(
            `⏰ *Cache expired!*\n\n` +
            `Your decrypted data is older than 30 minutes.\n` +
            `Please decrypt the file again with \`${ctx.prefix}decrypt\`.` +
            `\n\n_This is for security purposes._ 🔐`
        );
    }

    await ctx.reply(
        `🔄 *Generating importable config...*\n\n` +
        `📄 From: \`${cached.fileName}\`\n` +
        `🏷️ Format: ${SUPPORTED_EXTS[cached.ext] || 'Unknown'}`
    );

    const generated = generateImportableConfig(cached.decrypted, cached.ext);
    
    if (!generated) {
        return ctx.reply(
            `❌ *Cannot generate config!*\n\n` +
            `The decrypted data doesn't contain valid config structure.\n\n` +
            `_Try decrypting again or contact support._ 🆘`
        );
    }

    // Send the generated file
    const content = typeof generated.content === 'string' 
        ? Buffer.from(generated.content, 'utf-8') 
        : generated.content;

    await ctx.sock.sendMessage(ctx.from, {
        document: content,
        fileName: generated.filename,
        caption: (
            `✅ *Config Generated!*\n\n` +
            `📁 \`${generated.filename}\`\n` +
            `📋 Format: ${SUPPORTED_EXTS[cached.ext] || 'Unknown'}\n` +
            `💡 ${generated.instructions}\n\n` +
            `🤖 *Powered by ${dev.botName} v${dev.version}*`
        ),
        mimetype: 'text/plain'
    }, { quoted: ctx.msg });

    // Clear cache after generating
    ctx.sock.decryptedCache.delete(sessionKey);
}

// ============= EXPORTS =============
module.exports = { 
    run, 
    generateRun,
    description 
};