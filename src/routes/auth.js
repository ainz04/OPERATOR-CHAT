'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const repo = require('../repo');
const auth = require('../auth');
const hub = require('../hub');
const { ACCESS_WINDOW_MS } = require('../config');

const router = express.Router();
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,20}$/;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'TOO MANY ATTEMPTS. TERMINAL LOCKED FOR 15 MINUTES.' },
});

const me = (u) => ({
  id: u.id, username: u.username, role: u.role, accessCode: u.access_code,
  createdAt: u.created_at, windowMs: ACCESS_WINDOW_MS,
});

router.post('/register', authLimiter, async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'USERNAME: 3-20 CHARS, A-Z 0-9 _ . -' });
  if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'PASSWORD: MIN 8 CHARACTERS' });
  if (repo.users.byName(username)) return res.status(409).json({ error: 'USERNAME ALREADY REGISTERED' });
  const user = repo.users.create(username, await auth.hash(password));
  repo.logs.info('REGISTER', { userId: user.id, ip: req.ip, detail: username });
  hub.toAdmin('db:changed', {});
  auth.issue(res, user);
  res.json({ user: me(user) });
});

router.post('/login', authLimiter, async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const user = repo.users.byName(username);
  const ok = user && (await auth.verifyPassword(password, user.pass_hash));
  if (!ok) {
    repo.logs.warn('LOGIN_FAILED', { userId: user?.id, ip: req.ip, detail: username });
    return res.status(401).json({ error: 'INVALID CREDENTIALS' });
  }
  if (user.banned) {
    repo.logs.alert('LOGIN_BANNED', { userId: user.id, ip: req.ip });
    return res.status(403).json({ error: 'ACCOUNT TERMINATED BY OPERATOR' });
  }
  repo.logs.info(user.role === 'admin' ? 'ADMIN_LOGIN' : 'LOGIN', { userId: user.id, ip: req.ip });
  auth.issue(res, user);
  res.json({ user: me(user) });
});

router.post('/logout', (req, res) => { auth.clear(res); res.json({ ok: true }); });

router.get('/me', auth.requireAuth, (req, res) => res.json({ user: me(req.user) }));

router.post('/me/regen-code', auth.requireAuth, (req, res) => {
  const code = repo.users.regenCode(req.user.id);
  repo.logs.info('CODE_REGENERATED', { userId: req.user.id, ip: req.ip });
  res.json({ accessCode: code });
});

module.exports = router;
