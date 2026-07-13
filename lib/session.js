// lib/session.js — Session encode/decode for Arrow-MD
// Uses pure-Node ZIP (lib/zipUtils) + zlib compression + XOR + base64.
// No `zip` or `unzip` binary required.

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const dev            = require('../dev');
const { zipDir, unzipBuf } = require('./zipUtils');

const SESSION_DIR    = path.join(__dirname, '../baileys_auth');
const SESSION_PREFIX = 'Arrow-MD≈';

function xorBuffer(buf, key) {
  const keyBuf = Buffer.from(key, 'utf8');
  const out    = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ keyBuf[i % keyBuf.length];
  return out;
}

/**
 * Encode current baileys_auth/ folder into a session ID string.
 * Returns: "Arrow-MD≈<compressed-encrypted-base64>"
 */
function encodeSession() {
  if (!fs.existsSync(SESSION_DIR)) {
    throw new Error('No session folder found (baileys_auth/ does not exist).');
  }

  let zipData = zipDir(SESSION_DIR);

  try {
    zipData = zlib.deflateRawSync(zipData, { level: 9 });
    console.log('✅ Session compressed successfully');
  } catch {
    console.warn('⚠️ Compression failed, using uncompressed data');
  }

  const encrypted = xorBuffer(zipData, dev.sessionSecret);
  const b64 = encrypted.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const sessionString = SESSION_PREFIX + b64;
  console.log(`📏 Generated session ID (${sessionString.length} characters)`);
  return sessionString;
}

/**
 * Decode a session ID string and restore files to baileys_auth/.
 */
function decodeSession(sessionId) {
  if (!sessionId || !sessionId.startsWith(SESSION_PREFIX)) {
    throw new Error(`Invalid session ID. Must start with "${SESSION_PREFIX}".`);
  }

  let b64 = sessionId.slice(SESSION_PREFIX.length)
    .replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';

  let encrypted;
  try {
    encrypted = Buffer.from(b64, 'base64');
  } catch {
    throw new Error('Session ID is corrupted (invalid base64).');
  }

  let zipData = xorBuffer(encrypted, dev.sessionSecret);

  try {
    zipData = zlib.inflateRawSync(zipData);
    console.log('✅ Session decompressed successfully');
  } catch {
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

/**
 * Check whether a valid session already exists.
 */
function hasSession() {
  if (!fs.existsSync(SESSION_DIR)) return false;
  return fs.readdirSync(SESSION_DIR).includes('creds.json');
}

module.exports = { encodeSession, decodeSession, hasSession, SESSION_PREFIX };