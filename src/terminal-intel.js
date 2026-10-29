'use strict';
/**
 * Read-only intelligence commands for the TERMINAL.
 */
const repo = require('./repo');
const hub = require('./hub');
const ops = require('./ops');
const { fmt, pad, left, line } = require('./terminal');

const grantLine = (g) => `${pad(g.id, 5)}${pad(g.owner_name, 18)}<- ${pad(g.guest_name, 18)}${pad(left(g.expires_at - Date.now()), 10)}uses ${g.uses}`;

module.exports = {
  whois([ref]) {
    const u = ops.resolve(ref);
    const partners = repo.messages.partners(u.id).map((id) => repo.users.byId(id)?.username).filter(Boolean);
    const grants = repo.grants.forUser(u.id).map(grantLine);
    return [
      `SUBJECT ......... ${u.username} (#${u.id})`,
      `CLEARANCE ....... ${u.role === 'admin' ? 'LEVEL S' : 'AGENT'}`,
      `STATUS .......... ${u.banned ? 'BANNED' : hub.isOnline(u.id) ? 'ONLINE' : 'OFFLINE'}`,
      `ACCESS CODE ..... ${u.access_code}`,
      `REGISTERED ...... ${fmt(u.created_at)}`,
      `LAST SEEN ....... ${fmt(u.last_seen)}`,
      `CONTACTS ........ ${partners.join(', ') || '-'}`,
      'ACCESS WINDOWS:', ...(grants.length ? grants : ['   (none)']),
    ].join('\n');
  },

  grants([ref]) {
    const list = ref ? repo.grants.forUser(ops.resolve(ref).id) : repo.grants.all();
    if (!list.length) return 'NO ACCESS WINDOWS ON RECORD';
    return [`${pad('ID', 5)}${pad('CODE OWNER', 18)}   ${pad('GUEST', 18)}${pad('REMAINING', 10)}`, ...list.map(grantLine)].join('\n');
  },

  convos() {
    const list = repo.messages.conversations();
    if (!list.length) return 'NO CONVERSATIONS INTERCEPTED';
    return list.map((c) => {
      const a = repo.users.byId(c.a)?.username || `#${c.a}`;
      const b = repo.users.byId(c.b)?.username || `#${c.b}`;
      return `${pad(`${a} <-> ${b}`, 40)}${pad(`${c.count} msgs`, 11)}${pad(`${c.files} files`, 10)}last ${fmt(c.last_at)}`;
    }).join('\n');
  },

  read([ra, rb, n]) {
    const a = ops.resolve(ra);
    const b = ops.resolve(rb);
    const msgs = repo.messages.history(a.id, b.id, Number(n) || 50);
    return msgs.length ? msgs.map(line).join('\n') : 'NO TRAFFIC BETWEEN SUBJECTS';
  },

  feed([n]) {
    const msgs = repo.messages.recent(Number(n) || 25).reverse();
    return msgs.length ? msgs.map(line).join('\n') : 'NETWORK SILENT';
  },

  search(args) {
    const term = args.join(' ').trim();
    if (!term) throw new Error('SEARCH TERM REQUIRED');
    const hits = repo.messages.search(term).slice(0, 50);
    return hits.length ? `${hits.length} MATCH(ES)\n${hits.map(line).join('\n')}` : 'NO MATCHES';
  },

  files() {
    const list = repo.messages.allFiles();
    if (!list.length) return 'NO FILES IN VAULT';
    return list.map((f) => `#${pad(f.id, 5)}${pad(f.original_name, 30)}${pad(`${(f.size / 1024).toFixed(1)}KB`, 11)}${pad(`${f.uploader_name} -> ${f.recipient_name}`, 32)}${fmt(f.created_at)}`).join('\n');
  },

  logs([n]) {
    return repo.logs.recent(Number(n) || 30).reverse()
      .map((l) => `[${fmt(l.ts)}] ${pad(l.level, 6)}${pad(l.event, 18)}${pad(l.username || '-', 16)}${pad(l.ip || '', 16)}${l.detail || ''}`)
      .join('\n');
  },
};
