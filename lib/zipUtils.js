// lib/zipUtils.js
// Pure-Node ZIP creation and extraction — no `zip` / `unzip` binary required.
// Implements just enough of the ZIP spec (DEFLATE + local file headers +
// central directory) to produce a file that Node's built-in zlib can read back.

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── Low-level ZIP helpers ─────────────────────────────────────────────────────

function dosDateTime() {
  const d = new Date();
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { date, time };
}

function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })());
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function writeUInt16LE(val) {
  const b = Buffer.alloc(2); b.writeUInt16LE(val); return b;
}
function writeUInt32LE(val) {
  const b = Buffer.alloc(4); b.writeUInt32LE(val >>> 0); return b;
}

// ── Build a ZIP buffer from { name, data } entries ───────────────────────────

function buildZip(entries) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBytes     = Buffer.from(name, 'utf8');
    const compressed    = zlib.deflateRawSync(data, { level: 6 });
    const crc           = crc32(data);
    const { date, time } = dosDateTime();

    // Local file header
    const local = Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x03, 0x04]), // signature
      writeUInt16LE(20),                       // version needed
      writeUInt16LE(0),                        // flags
      writeUInt16LE(8),                        // compression: DEFLATE
      writeUInt16LE(time),
      writeUInt16LE(date),
      writeUInt32LE(crc),
      writeUInt32LE(compressed.length),
      writeUInt32LE(data.length),
      writeUInt16LE(nameBytes.length),
      writeUInt16LE(0),                        // extra length
      nameBytes,
      compressed,
    ]);

    // Central directory entry
    const central = Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x01, 0x02]), // signature
      writeUInt16LE(20),                       // version made by
      writeUInt16LE(20),                       // version needed
      writeUInt16LE(0),
      writeUInt16LE(8),
      writeUInt16LE(time),
      writeUInt16LE(date),
      writeUInt32LE(crc),
      writeUInt32LE(compressed.length),
      writeUInt32LE(data.length),
      writeUInt16LE(nameBytes.length),
      writeUInt16LE(0),                        // extra length
      writeUInt16LE(0),                        // comment length
      writeUInt16LE(0),                        // disk start
      writeUInt16LE(0),                        // internal attr
      writeUInt32LE(0),                        // external attr
      writeUInt32LE(offset),
      nameBytes,
    ]);

    localHeaders.push(local);
    centralHeaders.push(central);
    offset += local.length;
  }

  const centralBuf  = Buffer.concat(centralHeaders);
  const eocd        = Buffer.concat([
    Buffer.from([0x50, 0x4B, 0x05, 0x06]), // signature
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt16LE(entries.length),
    writeUInt16LE(entries.length),
    writeUInt32LE(centralBuf.length),
    writeUInt32LE(offset),
    writeUInt16LE(0),
  ]);

  return Buffer.concat([...localHeaders, centralBuf, eocd]);
}

// ── Walk a directory and collect { name, data } entries ──────────────────────

function collectEntries(dir, base = '') {
  const entries = [];
  for (const item of fs.readdirSync(dir)) {
    const full    = path.join(dir, item);
    const relName = base ? `${base}/${item}` : item;
    const stat    = fs.statSync(full);
    if (stat.isDirectory()) {
      entries.push(...collectEntries(full, relName));
    } else {
      entries.push({ name: relName, data: fs.readFileSync(full) });
    }
  }
  return entries;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a ZIP buffer from all files in a directory (recursive).
 */
function zipDir(dir) {
  const entries = collectEntries(dir);
  if (entries.length === 0) throw new Error('Directory is empty: ' + dir);
  return buildZip(entries);
}

/**
 * Extract a ZIP buffer into a directory.
 * Handles DEFLATE (method 8) and stored (method 0) entries.
 */
function unzipBuf(buf, destDir) {
  fs.mkdirSync(destDir, { recursive: true });

  let i = 0;
  while (i < buf.length - 4) {
    // Look for local file header signature
    if (buf.readUInt32LE(i) !== 0x04034B50) { i++; continue; }

    const method      = buf.readUInt16LE(i + 8);
    const compSize    = buf.readUInt32LE(i + 18);
    const nameLen     = buf.readUInt16LE(i + 26);
    const extraLen    = buf.readUInt16LE(i + 28);
    const name        = buf.slice(i + 30, i + 30 + nameLen).toString('utf8');
    const dataStart   = i + 30 + nameLen + extraLen;
    const compData    = buf.slice(dataStart, dataStart + compSize);

    const outPath = path.join(destDir, name);

    if (!name.endsWith('/')) {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      const data = method === 8 ? zlib.inflateRawSync(compData) : compData;
      fs.writeFileSync(outPath, data);
    }

    i = dataStart + compSize;
  }
}

module.exports = { zipDir, unzipBuf };