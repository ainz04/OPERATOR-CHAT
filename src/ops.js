'use strict';
/**
 * Level S operations shared by the admin REST API and the TERMINAL module.
 */
const repo = require('./repo');
const hub = require('./hub');

function resolve(ref) {
  if (ref === undefined || ref === null || ref === '') throw new Error('TARGET REQUIRED');
  const s = String(ref).replace(/^@/, '');
  const u = /^\d+$/.test(s) ? repo.users.byId(Number(s)) : repo.users.byName(s);
  if (!u) throw new Error(`SUBJECT "${s}" NOT FOUND`);
  return u;
}

function guardAdmin(u) {
  if (u.role === 'admin') throw new Error('CANNOT TARGET LEVEL S OPERATOR');
}

const changed = () => hub.toAdmin('db:changed', {});

module.exports = {
  resolve,
  async kick(admin, ref) {
    const u = resolve(ref); guardAdmin(u);
    repo.users.revokeSessions(u.id);
    const n = await hub.kick(u.id, 'SESSION TERMINATED BY OPERATOR');
    repo.logs.alert('KICK', { userId: admin.id, detail: u.username });
    changed();
    return `${u.username}: ${n} CONNECTION(S) TERMINATED, SESSIONS REVOKED`;
  },
  async ban(admin, ref) {
    const u = resolve(ref); guardAdmin(u);
    repo.users.setBanned(u.id, true);
    repo.grants.revokeAllFor(u.id);
    await hub.kick(u.id, 'ACCOUNT TERMINATED BY OPERATOR');
    repo.logs.alert('BAN', { userId: admin.id, detail: u.username });
    changed();
    return `${u.username}: BANNED. ALL ACCESS WINDOWS CLOSED.`;
  },
  unban(admin, ref) {
    const u = resolve(ref);
    repo.users.setBanned(u.id, false);
    repo.logs.info('UNBAN', { userId: admin.id, detail: u.username });
    changed();
    return `${u.username}: REINSTATED`;
  },
  revoke(admin, ref) {
    const u = resolve(ref);
    repo.grants.revokeAllFor(u.id);
    hub.toUser(u.id, 'contacts:refresh', {});
    repo.logs.warn('REVOKE_ACCESS', { userId: admin.id, detail: u.username });
    changed();
    return `${u.username}: ALL 5-HOUR ACCESS WINDOWS REVOKED`;
  },
  regen(admin, ref) {
    const u = resolve(ref);
    const code = repo.users.regenCode(u.id);
    hub.toUser(u.id, 'me:refresh', {});
    repo.logs.warn('CODE_REGEN', { userId: admin.id, detail: u.username });
    changed();
    return `${u.username}: NEW ACCESS CODE ${code}`;
  },
  async remove(admin, ref) {
    const u = resolve(ref); guardAdmin(u);
    await hub.kick(u.id, 'RECORD PURGED');
    repo.users.remove(u.id);
    repo.logs.alert('PURGE_USER', { userId: admin.id, detail: u.username });
    changed();
    return `${u.username}: RECORD PURGED FROM DATABASE`;
  },
  broadcast(admin, text) {
    if (!text) throw new Error('MESSAGE REQUIRED');
    hub.toAll('broadcast', { text, at: Date.now() });
    repo.logs.info('BROADCAST', { userId: admin.id, detail: text });
    return `BROADCAST TRANSMITTED TO ${hub.onlineIds().length} ONLINE TERMINAL(S)`;
  },
};
