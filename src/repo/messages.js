'use strict';
/**
 * Messages + files. Bodies are stored AES-256-GCM encrypted and decrypted on read.
 */
const db = require('../db');
const { encryptText, decryptText } = require('../vault');

const q = (sql) => db.prepare(sql);
const MSG = `SELECT m.*, s.username AS sender_name, r.username AS recipient_name,
    f.original_name, f.mime, f.size, f.sha256, f.md5
  FROM messages m
  JOIN users s ON s.id = m.sender_id
  JOIN users r ON r.id = m.recipient_id
  LEFT JOIN files f ON f.id = m.file_id`;

const S = {
  insert: q('INSERT INTO messages (sender_id, recipient_id, kind, body_enc, file_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  byId: q(`${MSG} WHERE m.id = ?`),
  history: q(`${MSG} WHERE (m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)
    ORDER BY m.id DESC LIMIT ?`),
  recent: q(`${MSG} ORDER BY m.id DESC LIMIT ?`),
  search: q(`${MSG} ORDER BY m.id DESC LIMIT 2000`),
  partners: q(`SELECT DISTINCT CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END AS pid
    FROM messages WHERE sender_id = ? OR recipient_id = ?`),
  conversations: q(`SELECT MIN(sender_id, recipient_id) AS a, MAX(sender_id, recipient_id) AS b,
      COUNT(*) AS count, MAX(created_at) AS last_at,
      SUM(CASE WHEN kind = 'file' THEN 1 ELSE 0 END) AS files
    FROM messages GROUP BY a, b ORDER BY last_at DESC`),
  insertFile: q(`INSERT INTO files (uploader_id, recipient_id, original_name, mime, size, sha256, md5, stored_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  fileById: q(`SELECT f.*, u.username AS uploader_name, r.username AS recipient_name
    FROM files f JOIN users u ON u.id = f.uploader_id JOIN users r ON r.id = f.recipient_id WHERE f.id = ?`),
  allFiles: q(`SELECT f.*, u.username AS uploader_name, r.username AS recipient_name
    FROM files f JOIN users u ON u.id = f.uploader_id JOIN users r ON r.id = f.recipient_id ORDER BY f.id DESC`),
  stats: q(`SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM messages) AS messages,
    (SELECT COUNT(*) FROM files) AS files, (SELECT COALESCE(SUM(size),0) FROM files) AS bytes,
    (SELECT COUNT(*) FROM grants WHERE expires_at > ?) AS active_grants`),
};

/** Decrypt a raw row into a client-safe object. */
function view(m) {
  if (!m) return m;
  return {
    id: m.id,
    from: m.sender_id, fromName: m.sender_name,
    to: m.recipient_id, toName: m.recipient_name,
    kind: m.kind,
    text: m.body_enc ? decryptText(m.body_enc) : '',
    file: m.file_id ? { id: m.file_id, name: m.original_name, mime: m.mime, size: m.size, sha256: m.sha256, md5: m.md5 } : null,
    at: m.created_at,
  };
}

module.exports = {
  view,
  send(from, to, text, kind = 'text', fileId = null) {
    const r = S.insert.run(from, to, kind, text ? encryptText(text) : null, fileId, Date.now());
    return view(S.byId.get(Number(r.lastInsertRowid)));
  },
  history: (a, b, limit = 300) => S.history.all(a, b, b, a, limit).reverse().map(view),
  recent: (limit = 100) => S.recent.all(limit).map(view),
  /** Full-text search runs after decryption (bodies are encrypted in the DB). */
  search(term) {
    const t = term.toLowerCase();
    return S.search.all().map(view).filter((m) =>
      m.text.toLowerCase().includes(t) || (m.file && m.file.name.toLowerCase().includes(t)));
  },
  partners: (id) => S.partners.all(id, id, id).map((r) => r.pid),
  conversations: () => S.conversations.all(),
  addFile(f) {
    const r = S.insertFile.run(f.uploader, f.recipient, f.name, f.mime, f.size, f.sha256, f.md5, f.stored, Date.now());
    return Number(r.lastInsertRowid);
  },
  file: (id) => S.fileById.get(id),
  allFiles: () => S.allFiles.all(),
  stats: () => S.stats.get(Date.now()),
};
