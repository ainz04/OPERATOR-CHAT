'use strict';
/**
 * Authentication: bcrypt password hashing, JWT in an httpOnly cookie,
 * token-version based revocation (kick/ban instantly invalidates sessions),
 * and single-admin bootstrap.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const cfg = require('./config');
const repo = require('./repo');

const COOKIE = 'fdi_session';

const hash = (pw) => bcrypt.hash(pw, 12);
const verifyPassword = (pw, h) => bcrypt.compare(pw, h);

function issue(res, user) {
  const token = jwt.sign({ uid: user.id, tv: user.token_version }, cfg.JWT_SECRET, {
    expiresIn: Math.floor(cfg.LOGIN_SESSION_MS / 1000),
  });
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'strict', secure: cfg.IS_PROD, maxAge: cfg.LOGIN_SESSION_MS, path: '/',
  });
}

const clear = (res) => res.clearCookie(COOKIE, { path: '/' });

/** Resolve a raw token to a live, non-banned user (or null). */
function userFromToken(token) {
  if (!token) return null;
  try {
    const p = jwt.verify(token, cfg.JWT_SECRET);
    const u = repo.users.byId(p.uid);
    if (!u || u.banned || u.token_version !== p.tv) return null;
    return u;
  } catch { return null; }
}

const tokenFromCookieHeader = (header) => cookie.parse(header || '')[COOKIE];

function requireAuth(req, res, next) {
  const u = userFromToken(req.cookies?.[COOKIE] ?? tokenFromCookieHeader(req.headers.cookie));
  if (!u) return res.status(401).json({ error: 'AUTHENTICATION REQUIRED' });
  req.user = u;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      repo.logs.alert('ADMIN_DENIED', { userId: req.user.id, ip: req.ip, detail: req.originalUrl });
      return res.status(403).json({ error: 'CLEARANCE LEVEL S REQUIRED' });
    }
    next();
  });
}

/** Ensure exactly one admin exists. Prints generated credentials once. */
async function bootstrapAdmin() {
  if (repo.users.admin()) return;
  const existing = repo.users.byName(cfg.ADMIN_USERNAME);
  if (existing) throw new Error(`Username "${cfg.ADMIN_USERNAME}" is taken by a non-admin user. Set ADMIN_USERNAME.`);
  const password = cfg.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const admin = repo.users.create(cfg.ADMIN_USERNAME, await hash(password), 'admin');
  repo.logs.info('ADMIN_CREATED', { userId: admin.id });
  console.log('\n================ LEVEL S ADMIN CREATED ================');
  console.log(`  username    : ${admin.username}`);
  console.log(`  password    : ${cfg.ADMIN_PASSWORD ? '(from ADMIN_PASSWORD)' : password}`);
  console.log(`  access code : ${admin.access_code}`);
  console.log('  Simpan password ini. Tidak akan ditampilkan lagi.');
  console.log('=======================================================\n');
}

module.exports = {
  COOKIE, hash, verifyPassword, issue, clear, userFromToken, tokenFromCookieHeader,
  requireAuth, requireAdmin, bootstrapAdmin,
};
