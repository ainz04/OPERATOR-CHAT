'use strict';
const db = require('../db');
const { generateAccessCode } = require('../vault');

const q = (sql) => db.prepare(sql);
const S = {
  byId: q('SELECT * FROM users WHERE id = ?'),
  byName: q('SELECT * FROM users WHERE username = ?'),
  byCode: q('SELECT * FROM users WHERE access_code = ?'),
  admin: q("SELECT * FROM users WHERE role = 'admin' LIMIT 1"),
  insert: q('INSERT INTO users (username, pass_hash, access_code, role, created_at) VALUES (?, ?, ?, ?, ?)'),
  touch: q('UPDATE users SET last_seen = ? WHERE id = ?'),
  setBanned: q('UPDATE users SET banned = ?, token_version = token_version + 1 WHERE id = ?'),
  bumpToken: q('UPDATE users SET token_version = token_version + 1 WHERE id = ?'),
  setCode: q('UPDATE users SET access_code = ? WHERE id = ?'),
  setPass: q('UPDATE users SET pass_hash = ?, token_version = token_version + 1 WHERE id = ?'),
  del: q('DELETE FROM users WHERE id = ?'),
  all: q(`SELECT u.id, u.username, u.access_code, u.role, u.banned, u.created_at, u.last_seen,
      (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id) AS sent,
      (SELECT COUNT(*) FROM files f WHERE f.uploader_id = u.id) AS files
    FROM users u ORDER BY (u.role = 'admin') DESC, u.created_at DESC`),
};

function uniqueCode() {
  for (;;) {
    const code = generateAccessCode();
    if (!S.byCode.get(code)) return code;
  }
}

module.exports = {
  byId: (id) => S.byId.get(id),
  byName: (name) => S.byName.get(name),
  byCode: (code) => S.byCode.get(code),
  admin: () => S.admin.get(),
  create(username, passHash, role = 'agent') {
    const r = S.insert.run(username, passHash, uniqueCode(), role, Date.now());
    return S.byId.get(Number(r.lastInsertRowid));
  },
  touch: (id) => S.touch.run(Date.now(), id),
  setBanned: (id, banned) => S.setBanned.run(banned ? 1 : 0, id),
  revokeSessions: (id) => S.bumpToken.run(id),
  regenCode(id) { const c = uniqueCode(); S.setCode.run(c, id); return c; },
  setPassword: (id, hash) => S.setPass.run(hash, id),
  remove: (id) => S.del.run(id),
  all: () => S.all.all(),
  /** Safe public projection (never leaks hash / code). */
  pub: (u) => u && ({ id: u.id, username: u.username, role: u.role }),
};
