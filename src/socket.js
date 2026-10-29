'use strict';
/**
 * Socket.IO handler: real-time event routing, authentication & typing sync.
 */
const auth = require('./auth');
const hub = require('./hub');
const chat = require('./chat');
const repo = require('./repo');
const terminal = require('./terminal-run');

function setupSocket(io) {
  hub.setIO(io);

  io.use((socket, next) => {
    const rawCookie = socket.handshake.headers.cookie || '';
    const token = socket.handshake.auth?.token || auth.tokenFromCookieHeader(rawCookie);
    const user = auth.userFromToken(token);
    if (!user) {
      return next(new Error('UNAUTHORIZED_TERMINAL'));
    }
    socket.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    const ip = socket.handshake.address;
    const ua = socket.handshake.headers['user-agent'] || '';

    // Join personal room and presence tracking
    socket.join(`u:${user.id}`);
    if (user.role === 'admin') {
      socket.join('admin');
    }
    hub.join(socket, user, ip, ua);
    repo.users.touch(user.id);

    // Notify online status
    hub.toAll('presence:update', { userId: user.id, online: true });

    // Handle text messages via socket
    socket.on('chat:send', (data, cb) => {
      try {
        const to = Number(data?.to);
        const text = String(data?.text || '').trim();
        if (!to || !text) {
          if (typeof cb === 'function') cb({ error: 'EMPTY_PAYLOAD' });
          return;
        }
        const res = chat.sendText(user, to, text);
        if (typeof cb === 'function') cb(res);
      } catch (err) {
        if (typeof cb === 'function') cb({ error: err.message });
      }
    });

    // Real-time typing indicator with sound trigger
    socket.on('chat:typing', (data) => {
      const to = Number(data?.to);
      if (to) {
        hub.toUser(to, 'chat:typing', {
          from: user.id,
          username: user.username,
          isTyping: !!data?.isTyping
        });
      }
    });

    // Real-time terminal command execution for Level S Admin
    socket.on('terminal:exec', async (data, cb) => {
      if (user.role !== 'admin') {
        if (typeof cb === 'function') cb({ error: 'LEVEL_S_REQUIRED' });
        return;
      }
      try {
        const result = await terminal.run(user, data?.command, ip);
        if (typeof cb === 'function') cb(result);
      } catch (err) {
        if (typeof cb === 'function') cb({ error: err.message });
      }
    });

    socket.on('disconnect', () => {
      const left = hub.leave(socket);
      if (left && !hub.isOnline(user.id)) {
        hub.toAll('presence:update', { userId: user.id, online: false });
      }
    });
  });

  // Listen to system audit log and forward to Level S operator in real-time
  repo.logs.onEntry((entry) => {
    hub.toAdmin('log:entry', entry);
  });
}

module.exports = setupSocket;
