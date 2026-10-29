'use strict';
/**
 * TERMINAL module: command interpreter for the Level S operator.
 */
const repo = require('./repo');
const hub = require('./hub');
const ops = require('./ops');
const HELP = require('./terminal-help');

const fmt = (ts) => (ts ? new Date(ts).toLocaleString('sv-SE') : '-');
const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
function left(ms) {
  if (ms <= 0) return 'EXPIRED';
  const m = Math.floor(ms / 60000);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
const line = (m) => `[${fmt(m.at)}] ${m.fromName} -> ${m.toName}: ${m.kind === 'file' ? `<FILE #${m.file?.id} ${m.file?.name}> ` : ''}${m.text}`;

const commands = {
  help: () => HELP,

  stats() {
    const s = repo.messages.stats();
    return [
      `SUBJECTS ........ ${s.users}`,
      `ONLINE .......... ${hub.onlineIds().length}`,
      `MESSAGES ........ ${s.messages}`,
      `FILES ........... ${s.files} (${(s.bytes / 1048576).toFixed(2)} MB)`,
      `ACTIVE WINDOWS .. ${s.active_grants}`,
    ].join('\n');
  },

  users() {
    const head = `${pad('ID', 5)}${pad('USERNAME', 20)}${pad('LEVEL', 9)}${pad('STATUS', 9)}${pad('ACCESS CODE', 16)}${pad('MSGS', 6)}LAST SEEN`;
    const rows = repo.users.all().map((u) => {
      const status = u.banned ? 'BANNED' : hub.isOnline(u.id) ? 'ONLINE' : 'offline';
      const lvl = u.role === 'admin' ? 'LEVEL-S' : 'AGENT';
      return `${pad(u.id, 5)}${pad(u.username, 20)}${pad(lvl, 9)}${pad(status, 9)}${pad(u.access_code, 16)}${pad(u.sent, 6)}${fmt(u.last_seen)}`;
    });
    return [head, ...rows].join('\n');
  },

  online() {
    const c = hub.connections();
    if (!c.length) return 'NO ACTIVE CONNECTIONS';
    return c.map((x) => `${pad(x.username, 20)}${pad(x.ip, 18)}since ${fmt(x.since)}`).join('\n');
  },
};

module.exports = { commands, fmt, pad, left, line };
