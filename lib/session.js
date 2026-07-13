// lib/session.js — Session encode/decode for WhatsApp
// Uses pure-Node ZIP (lib/zipUtils) + zlib compression + XOR + base64.
// No `zip` or `unzip` binary required.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { zipDir, unzipBuf } = require('./zipUtils');

// ============= CONFIG =============
const SESSION_DIR = path.join(__dirname, '../baileys_auth');
const SESSION_PREFIX = 'Arrow-MD≈';

// Get secret from environment or generate one
function getSessionSecret() {
    // Check environment variable first
    if (process.env.SESSION_SECRET) {
        return process.env.SESSION_SECRET;
    }
    
    // Check if we have a saved secret
    const secretFile = path.join(__dirname, '../.session_secret');
    if (fs.existsSync(secretFile)) {
        try {
            return fs.readFileSync(secretFile, 'utf8').trim();
        } catch (e) {}
    }
    
    // Generate a new secret and save it
    const newSecret = crypto.randomBytes(32).toString('hex');
    try {
        fs.writeFileSync(secretFile, newSecret);
        console.log('🔑 Generated new session secret (saved to .session_secret)');
    } catch (e) {}
    
    return newSecret;
}

// ============= XOR BUFFER =============
function xorBuffer(buf, key) {
    const keyBuf = Buffer.from(key, 'utf8');
    const out = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) {
        out[i] = buf[i] ^ keyBuf[i % keyBuf.length];
    }
    return out;
}

// ============= ENCODE SESSION =============
function encodeSession() {
    if (!fs.existsSync(SESSION_DIR)) {
        throw new Error('No session folder found (baileys_auth/ does not exist).');
    }

    console.log('📦 Compressing session folder...');
    let zipData = zipDir(SESSION_DIR);

    try {
        zipData = zlib.deflateRawSync(zipData, { level: 9 });
        console.log('✅ Session compressed successfully');
    } catch (err) {
        console.warn('⚠️ Compression failed, using uncompressed data');
    }

    const secret = getSessionSecret();
    const encrypted = xorBuffer(zipData, secret);
    
    const b64 = encrypted.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const sessionString = SESSION_PREFIX + b64;
    console.log(`📏 Generated session ID (${sessionString.length} characters)`);
    
    return sessionString;
}

// ============= DECODE SESSION =============
function decodeSession(sessionId) {
    if (!sessionId || !sessionId.startsWith(SESSION_PREFIX)) {
        throw new Error(`Invalid session ID. Must start with "${SESSION_PREFIX}".`);
    }

    console.log('📦 Restoring session from ID...');
    
    let b64 = sessionId.slice(SESSION_PREFIX.length)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    
    while (b64.length % 4 !== 0) b64 += '=';

    let encrypted;
    try {
        encrypted = Buffer.from(b64, 'base64');
    } catch (err) {
        throw new Error('Session ID is corrupted (invalid base64).');
    }

    const secret = getSessionSecret();
    let zipData = xorBuffer(encrypted, secret);

    try {
        zipData = zlib.inflateRawSync(zipData);
        console.log('✅ Session decompressed successfully');
    } catch (err) {
        console.warn('⚠️ Decompression failed, trying as raw zip data');
    }

    if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    // Extract entirely in Node — no `unzip` binary needed
    unzipBuf(zipData, SESSION_DIR);

    console.log('✅ Session restored successfully');
    return true;
}

// ============= CHECK SESSION =============
function hasSession() {
    if (!fs.existsSync(SESSION_DIR)) return false;
    const files = fs.readdirSync(SESSION_DIR);
    return files.includes('creds.json') || files.some(f => f.includes('creds'));
}

// ============= CLEAN SESSION =============
function cleanSession() {
    if (!fs.existsSync(SESSION_DIR)) return;
    console.log('🧹 Cleaning session folder...');
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    console.log('✅ Session cleaned');
}

// ============= EXPORTS =============
module.exports = {
    encodeSession,
    decodeSession,
    hasSession,
    cleanSession,
    SESSION_PREFIX,
    getSessionSecret
};