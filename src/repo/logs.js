'use strict';
/**
 * Audit log. Listeners (e.g. the admin socket room) are notified live.
 */
const db = require('../db');

const ins = db.prepare('INSERT INTO logs (ts, level, event, user_id, ip, detail) VALUES (?, ?, ?, ?, ?, ?)');
const recent = db.prepare(`SELECT l.*, u.username FROM logs l LEFT JOIN users u ON u.id = l.user_id
  ORDER BY l.id DESC LIMIT ?`);
const listeners = new Set();

function write(level, event, { userId = null, ip = null, detail = '' } = {}) {
  const ts = Date.now();
  const r = ins.run(ts, level, event, userId, ip, String(detail).slice(0, 500));
  const entry = { id: Number(r.lastInsertRowid), ts, level, event, user_id: userId, ip, detail };
  for (const fn of listeners) { try { fn(entry); } catch { /* ignore */ } }
  return entry;
}

module.exports = {
  info: (event, meta) => write('INFO', event, meta),
  warn: (event, meta) => write('WARN', event, meta),
  alert: (event, meta) => write('ALERT', event, meta),
  recent: (limit = 200) => recent.all(limit),
  onEntry: (fn) => listeners.add(fn),
};
