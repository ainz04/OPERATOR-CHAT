'use strict';
/**
 * FILE ANALYZER: forensic summary of a stored file.
 */
const SIGS = [
  ['89504e470d0a1a0a', 'PNG image', 'image/png'],
  ['ffd8ff', 'JPEG image', 'image/jpeg'],
  ['474946383', 'GIF image', 'image/gif'],
  ['52494646', 'RIFF container (WAV/WEBP/AVI)', null],
  ['25504446', 'PDF document', 'application/pdf'],
  ['504b0304', 'ZIP archive (DOCX/XLSX/APK/JAR)', 'application/zip'],
  ['526172211a07', 'RAR archive', 'application/x-rar-compressed'],
  ['377abcaf271c', '7-Zip archive', 'application/x-7z-compressed'],
  ['1f8b', 'GZIP archive', 'application/gzip'],
  ['4d5a', 'Windows executable (PE)', 'application/x-msdownload'],
  ['7f454c46', 'ELF executable', 'application/x-elf'],
  ['494433', 'MP3 audio (ID3)', 'audio/mpeg'],
  ['fffb', 'MP3 audio', 'audio/mpeg'],
  ['4f676753', 'OGG container', 'audio/ogg'],
  ['1a45dfa3', 'Matroska/WebM', 'video/webm'],
  ['664c6143', 'FLAC audio', 'audio/flac'],
  ['424d', 'BMP image', 'image/bmp'],
];

function magic(buf) {
  const hex = buf.subarray(0, 16).toString('hex');
  if (hex.slice(8, 16) === '66747970') return { type: 'ISO media (MP4/MOV/M4A/HEIC)', mime: null };
  for (const [sig, type, mime] of SIGS) if (hex.startsWith(sig)) return { type, mime };
  const sample = buf.subarray(0, 1024);
  const printable = sample.filter((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127)).length;
  if (sample.length && printable / sample.length > 0.95) return { type: 'Plain text / script', mime: 'text/plain' };
  return { type: 'Unknown binary', mime: null };
}

function entropy(buf) {
  if (!buf.length) return 0;
  const freq = new Array(256).fill(0);
  for (const b of buf) freq[b]++;
  let e = 0;
  for (const c of freq) if (c) { const p = c / buf.length; e -= p * Math.log2(p); }
  return Math.round(e * 1000) / 1000;
}

function hexdump(buf, max = 512) {
  const lines = [];
  for (let off = 0; off < Math.min(buf.length, max); off += 16) {
    const chunk = buf.subarray(off, off + 16);
    const hex = [...chunk].map((b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(47);
    const ascii = [...chunk].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${off.toString(16).padStart(8, '0')}  ${hex}  |${ascii}|`);
  }
  return lines.join('\n');
}

function strings(buf, minLen = 5, limit = 40) {
  const out = [];
  let cur = '';
  for (let i = 0; i < Math.min(buf.length, 2_000_000) && out.length < limit; i++) {
    const b = buf[i];
    if (b >= 32 && b < 127) cur += String.fromCharCode(b);
    else { if (cur.length >= minLen) out.push(cur.slice(0, 120)); cur = ''; }
  }
  if (cur.length >= minLen && out.length < limit) out.push(cur.slice(0, 120));
  return out;
}

function imageInfo(buf) {
  const hex = buf.subarray(0, 4).toString('hex');
  if (hex === '89504e47' && buf.length > 24) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (hex.startsWith('474946') && buf.length > 10) return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (hex.startsWith('424d') && buf.length > 26) return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)) };
  if (hex.startsWith('ffd8')) {
    let exif = false;
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker === 0xe1 && buf.subarray(i + 4, i + 8).toString('latin1') === 'Exif') exif = true;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5), exif };
      }
      i += 2 + len;
    }
    return { exif };
  }
  return null;
}

function analyze(buf, record) {
  const m = magic(buf);
  const e = entropy(buf.subarray(0, 4_000_000));
  const claimed = (record.mime || '').toLowerCase();
  const mismatch = !!(m.mime && claimed && !claimed.startsWith(m.mime.split('/')[0]) && m.mime !== claimed);
  const ext = (record.original_name.split('.').pop() || '').toLowerCase();
  const flags = [];
  if (mismatch) flags.push(`MIME MISMATCH: declared ${claimed}, signature says ${m.mime}`);
  if (/executable/i.test(m.type)) flags.push('EXECUTABLE PAYLOAD DETECTED');
  if (e > 7.5 && !/image|audio|video|archive|PDF/i.test(m.type)) flags.push('HIGH ENTROPY: possibly encrypted/packed');
  if (['exe', 'bat', 'cmd', 'ps1', 'vbs', 'js', 'scr', 'msi', 'apk'].includes(ext)) flags.push(`RISKY EXTENSION .${ext}`);
  return {
    id: record.id, name: record.original_name, declaredMime: record.mime, size: record.size,
    sha256: record.sha256, md5: record.md5, uploader: record.uploader_name, recipient: record.recipient_name,
    createdAt: record.created_at, signature: m.type, detectedMime: m.mime, entropy: e,
    image: imageInfo(buf), flags, hexdump: hexdump(buf), strings: strings(buf),
  };
}

module.exports = { analyze };
