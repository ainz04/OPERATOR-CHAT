'use strict';
/**
 * Level S admin API. Every route requires the single admin account.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const repo = require('../repo');
const auth = require('../auth');
const hub = require('../hub');
const ops = require('../ops');
const vault = require('../vault');
const cfg = require('../config');
const { analyze } = require('../analyzer');
const terminal = require('../terminal-run');

const router = express.Router();
router.use(auth.requireAdmin);

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req, res)); }
  catch (e) { res.status(400).json({ error: e.message }); }
};
const name = (id) => repo.users.byId(id)?.username || `#${id}`;

router.get('/overview', wrap(() => ({
  stats: repo.messages.stats(),
  online: hub.onlineIds(),
  connections: hub.connections(),
  logs: repo.logs.recent(80),
})));

router.get('/users', wrap(() => ({
  users: repo.users.all().map((u) => ({ ...u, online: hub.isOnline(u.id) })),
})));

router.get('/users/:id', wrap((req) => {
  const u = ops.resolve(req.params.id);
  return {
    user: {
      id: u.id, username: u.username, role: u.role, access_code: u.access_code, banned: !!u.banned,
      created_at: u.created_at, last_seen: u.last_seen, online: hub.isOnline(u.id),
    },
    grants: repo.grants.forUser(u.id),
    partners: repo.messages.partners(u.id).map((id) => ({ id, username: name(id) })),
  };
}));

router.get('/grants', wrap(() => ({ grants: repo.grants.all() })));
/* INTERCEPT: read every conversation on the network */
router.get('/conversations', wrap(() => ({
  conversations: repo.messages.conversations().map((c) => ({ ...c, aName: name(c.a), bName: name(c.b) })),
})));

router.get('/conversations/:a/:b', wrap((req) => ({
  messages: repo.messages.history(Number(req.params.a), Number(req.params.b), 1000),
})));

router.get('/feed', wrap((req) => ({
  messages: repo.messages.recent(Math.min(Number(req.query.limit) || 100, 500)).reverse(),
})));

router.get('/search', wrap((req) => {
  const term = String(req.query.q || '').trim();
  if (!term) throw new Error('SEARCH TERM REQUIRED');
  return { messages: repo.messages.search(term).slice(0, 200) };
}));
/* FILE ANALYZER */
router.get('/files', wrap(() => ({ files: repo.messages.allFiles() })));

router.get('/files/:id/analyze', wrap((req) => {
  const f = repo.messages.file(Number(req.params.id));
  if (!f) throw new Error('FILE NOT FOUND');
  const buf = vault.decryptBuffer(fs.readFileSync(path.join(cfg.UPLOAD_DIR, f.stored_name)));
  repo.logs.info('FILE_ANALYZED', { userId: req.user.id, ip: req.ip, detail: f.original_name });
  return { report: analyze(buf, f) };
}));

/* ACTIONS */
const ACTIONS = { kick: ops.kick, ban: ops.ban, unban: ops.unban, revoke: ops.revoke, regen: ops.regen, purge: ops.remove };

router.post('/users/:id/:action', wrap(async (req) => {
  const fn = ACTIONS[req.params.action];
  if (!fn) throw new Error('UNKNOWN ACTION');
  return { output: await fn(req.user, req.params.id) };
}));

router.post('/broadcast', wrap((req) => ({ output: ops.broadcast(req.user, String(req.body?.text || '').trim()) })));

/* TERMINAL */
router.post('/terminal', wrap((req) => terminal.run(req.user, req.body?.command, req.ip)));

module.exports = router;
