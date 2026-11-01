'use strict';
/**
 * Central configuration + persistent secret management.
 * Secrets (JWT signing key, at-rest master key) are generated once and stored
 * in data/secrets.json unless supplied through environment variables.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch { /* .env is optional */ }

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'vault');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const SECRETS_FILE = path.join(DATA_DIR, 'secrets.json');

function loadSecrets() {
  let stored = {};
  if (fs.existsSync(SECRETS_FILE)) {
    stored = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8'));
  }
  let dirty = false;
  if (!stored.jwtSecret) { stored.jwtSecret = crypto.randomBytes(48).toString('hex'); dirty = true; }
  if (!stored.masterKey) { stored.masterKey = crypto.randomBytes(32).toString('hex'); dirty = true; }
  if (dirty) fs.writeFileSync(SECRETS_FILE, JSON.stringify(stored, null, 2), { mode: 0o600 });
  return stored;
}

const secrets = loadSecrets();

const masterKeyHex = process.env.MASTER_KEY || secrets.masterKey;
if (!/^[0-9a-fA-F]{64}$/.test(masterKeyHex)) {
  throw new Error('MASTER_KEY must be 64 hex characters (32 bytes).');
}

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PROD: process.env.NODE_ENV === 'production',
  DATA_DIR,
  UPLOAD_DIR,
  DB_FILE: path.join(DATA_DIR, 'operator.db'),
  JWT_SECRET: process.env.JWT_SECRET || secrets.jwtSecret,
  MASTER_KEY: Buffer.from(masterKeyHex, 'hex'),
  ADMIN_USERNAME: (process.env.ADMIN_USERNAME || 'OPERATOR').trim(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  ACCESS_WINDOW_MS: (Number(process.env.ACCESS_WINDOW_HOURS) || 5) * 60 * 60 * 1000,
  LOGIN_SESSION_MS: 12 * 60 * 60 * 1000,
  MAX_FILE_BYTES: (Number(process.env.MAX_FILE_MB) || 15) * 1024 * 1024,
  MAX_MESSAGE_CHARS: 4000,
};
