'use strict';
/**
 * Access grants: entering someone's code creates/refreshes a 5-hour window
 * during which both parties may exchange messages.
 */
const db = require('../db');
const { ACCESS_WINDOW_MS } = require('../config');

const q = (sql) => db.prepare(sql);
const SELECT = `SELECT g.*, o.username AS owner_name, gu.username AS guest_name
  FROM grants g JOIN users o ON o.id = g.owner_id JOIN users gu ON gu.id = g.guest_id`;

const S = {
  upsert: q(`INSERT INTO grants (owner_id, guest_id, expires_at, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(owner_id, guest_id) DO UPDATE SET expires_at = excluded.expires_at, uses = uses + 1`),
  between: q(`SELECT * FROM grants WHERE expires_at > ? AND
    ((owner_id = ? AND guest_id = ?) OR (owner_id = ? AND guest_id = ?))
    ORDER BY expires_at DESC LIMIT 1`),
  forUser: q(`${SELECT} WHERE g.owner_id = ? OR g.guest_id = ? ORDER BY g.expires_at DESC`),
  all: q(`${SELECT} ORDER BY g.expires_at DESC`),
  expire: q('UPDATE grants SET expires_at = ? WHERE id = ?'),
  expireUser: q('UPDATE grants SET expires_at = ? WHERE (owner_id = ? OR guest_id = ?) AND expires_at > ?'),
  byId: q(`${SELECT} WHERE g.id = ?`),
};

module.exports = {
  open(ownerId, guestId) {
    const exp = Date.now() + ACCESS_WINDOW_MS;
    S.upsert.run(ownerId, guestId, exp, Date.now());
    return exp;
  },
  /** Active grant between two users in either direction, or undefined. */
  between: (a, b) => S.between.get(Date.now(), a, b, b, a),
  forUser: (id) => S.forUser.all(id, id),
  all: () => S.all.all(),
  byId: (id) => S.byId.get(id),
  revoke: (id) => S.expire.run(Date.now() - 1, id),
  revokeAllFor: (userId) => S.expireUser.run(Date.now() - 1, userId, userId, Date.now()),
};
