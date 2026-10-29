'use strict';
/**
 * Chat rules shared by HTTP + socket layers.
 *  - Agents may message each other only during an active 5-hour grant
 *    (created when one enters the other's private access code).
 *  - The Level S admin may message anyone; doing so opens a 5-hour reply
 *    window for the recipient.
 */
const repo = require('./repo');
const hub = require('./hub');

function checkChannel(sender, recipientId) {
  const target = repo.users.byId(Number(recipientId));
  if (!target || target.id === sender.id) return { error: 'TARGET NOT FOUND' };
  if (target.banned) return { error: 'TARGET TERMINATED' };
  if (sender.role === 'admin') return { target };
  const grant = repo.grants.between(sender.id, target.id);
  if (!grant) return { error: 'ACCESS WINDOW EXPIRED. RE-ENTER ACCESS CODE.' };
  return { target, grant };
}

function afterSend(sender, target) {
  if (sender.role === 'admin') {
    const exp = repo.grants.open(sender.id, target.id);
    hub.toUser(target.id, 'contacts:refresh', { expiresAt: exp });
  }
}

function sendText(sender, recipientId, text) {
  const ch = checkChannel(sender, recipientId);
  if (ch.error) return ch;
  const msg = repo.messages.send(sender.id, ch.target.id, text, 'text');
  afterSend(sender, ch.target);
  hub.deliver(msg);
  return { msg };
}

function sendFile(sender, target, fileId, caption) {
  const msg = repo.messages.send(sender.id, target.id, caption || '', 'file', fileId);
  afterSend(sender, target);
  hub.deliver(msg);
  return { msg };
}

module.exports = { checkChannel, sendText, sendFile };
