'use strict';
/**
 * File transfer. Files are AES-256-GCM encrypted on disk and only served to
 * the uploader, the recipient, or the Level S admin.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const repo = require('../repo');
const auth = require('../auth');
const chat = require('../chat');
const vault = require('../vault');
const cfg = require('../config');

const router = express.Router();
router.use(auth.requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: cfg.MAX_FILE_BYTES, files: 1 } });

router.post('/:peer', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(413).json({ error: `UPLOAD FAILED: ${err.message}` });
    if (!req.file) return res.status(400).json({ error: 'NO FILE' });
    const ch = chat.checkChannel(req.user, req.params.peer);
    if (ch.error) return res.status(403).json({ error: ch.error });

    const buf = req.file.buffer;
    const stored = crypto.randomBytes(16).toString('hex') + '.bin';
    fs.writeFileSync(path.join(cfg.UPLOAD_DIR, stored), vault.encryptBuffer(buf));
    const name = path.basename(Buffer.from(req.file.originalname, 'latin1').toString('utf8')).slice(0, 200);
    const fileId = repo.messages.addFile({
      uploader: req.user.id, recipient: ch.target.id, name,
      mime: req.file.mimetype || 'application/octet-stream',
      size: buf.length, sha256: vault.sha256(buf), md5: vault.md5(buf), stored,
    });
    repo.logs.info('FILE_SENT', { userId: req.user.id, ip: req.ip, detail: `${name} -> ${ch.target.username}` });
    const { msg } = chat.sendFile(req.user, ch.target, fileId, String(req.body?.caption || '').slice(0, 500));
    res.json({ message: msg });
  });
});

// Only these types are rendered inline; everything else is forced to download.
const INLINE_SAFE = /^(image\/(png|jpeg|gif|webp|bmp)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+)$/i;

router.get('/:id', (req, res) => {
  const f = repo.messages.file(Number(req.params.id));
  if (!f) return res.status(404).end();
  const allowed = req.user.role === 'admin' || f.uploader_id === req.user.id || f.recipient_id === req.user.id;
  if (!allowed) return res.status(403).end();
  let buf;
  try { buf = vault.decryptBuffer(fs.readFileSync(path.join(cfg.UPLOAD_DIR, f.stored_name))); }
  catch { return res.status(410).json({ error: 'FILE CORRUPTED OR MISSING' }); }
  const inline = INLINE_SAFE.test(f.mime) && req.query.download !== '1';
  res.setHeader('Content-Type', inline ? f.mime : 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(buf);
});

module.exports = router;
