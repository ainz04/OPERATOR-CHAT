'use strict';
/**
 * At-rest encryption (AES-256-GCM) for message bodies and stored files.
 * Format: iv[12] | tag[16] | ciphertext  (strings are base64 of that blob)
 */
const crypto = require('crypto');
const { MASTER_KEY } = require('./config');

function encryptBuffer(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

function decryptBuffer(blob) {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const data = blob.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

const encryptText = (text) => encryptBuffer(Buffer.from(String(text), 'utf8')).toString('base64');

function decryptText(b64) {
  try { return decryptBuffer(Buffer.from(b64, 'base64')).toString('utf8'); }
  catch { return '[DATA CORRUPTED]'; }
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

/** Human-friendly private access code, e.g. "K7QX-M2PA-9TZD" (no ambiguous chars). */
function generateAccessCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i === 3 || i === 7) out += '-';
  }
  return out;
}

module.exports = { encryptBuffer, decryptBuffer, encryptText, decryptText, sha256, md5, generateAccessCode };
