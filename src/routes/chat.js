'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const repo = require('../repo');
const auth = require('../auth');
const hub = require('../hub');

const router = express.Router();
router.use(auth.requireAuth);

const codeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `code:${req.user.id}`,
  message: { error: 'TOO MANY CODE ATTEMPTS. WAIT 15 MINUTES.' },
});

/* ACCESS CODE: opens a 5-hour window with the code owner */
router.post('/access', codeLimiter, (req, res) => {
  const code = String(req.body?.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    .replace(/^(.{4})(.{4})(.{4})$/, '$1-$2-$3');
  const owner = repo.users.byCode(code);
  if (!owner || owner.banned) {
    repo.logs.warn('CODE_INVALID', { userId: req.user.id, ip: req.ip, detail: code });
    return res.status(404).json({ error: 'ACCESS CODE REJECTED' });
  }
  if (owner.id === req.user.id) return res.status(400).json({ error: 'THAT IS YOUR OWN CODE' });
  const expiresAt = repo.grants.open(owner.id, req.user.id);
  repo.logs.info('CODE_ACCEPTED', { userId: req.user.id, ip: req.ip, detail: `-> ${owner.username}` });
  hub.toUser(owner.id, 'contacts:refresh', {});
  hub.toAdmin('db:changed', {});
  res.json({ contact: { ...repo.users.pub(owner), expiresAt } });
});

/* CONTACTS */
router.get('/contacts', (req, res) => {
  const me = req.user;
  const isAdmin = me.role === 'admin';
  const map = new Map();
  const add = (u, expiresAt = 0) => {
    if (!u || u.id === me.id) return;
    const prev = map.get(u.id);
    map.set(u.id, {
      ...repo.users.pub(u), banned: !!u.banned, online: hub.isOnline(u.id),
      expiresAt: Math.max(prev?.expiresAt || 0, expiresAt || 0) || null,
    });
  };
  if (isAdmin) {
    for (const u of repo.users.all()) add(u);
  } else {
    for (const g of repo.grants.forUser(me.id)) {
      add(repo.users.byId(g.owner_id === me.id ? g.guest_id : g.owner_id), g.expires_at);
    }
    for (const pid of repo.messages.partners(me.id)) add(repo.users.byId(pid));
  }
  const now = Date.now();
  const contacts = [...map.values()].map((c) => ({
    ...c, unlimited: isAdmin, active: isAdmin || (!!c.expiresAt && c.expiresAt > now),
  }));
  res.json({ contacts });
});

/* MESSAGE HISTORY (only your own conversations) */
router.get('/messages/:peer', (req, res) => {
  res.json({ messages: repo.messages.history(req.user.id, Number(req.params.peer)) });
});

module.exports = router;
