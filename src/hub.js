'use strict';
/**
 * Realtime hub shared by HTTP routes and the socket layer.
 * Rooms: "u:<id>" per user, "admin" for the Level S operator.
 */
let io = null;
const online = new Map(); // userId -> Set<socketId>
const meta = new Map();   // socketId -> { userId, username, ip, ua, since }

function emit(room, ev, data) { if (io) io.to(room).emit(ev, data); }

module.exports = {
  setIO(instance) { io = instance; },
  toUser: (id, ev, data) => emit(`u:${id}`, ev, data),
  toAdmin: (ev, data) => emit('admin', ev, data),
  toAll: (ev, data) => { if (io) io.emit(ev, data); },

  /** Deliver a message to both parties and mirror it to the admin intercept feed. */
  deliver(msg) {
    emit(`u:${msg.from}`, 'message', msg);
    emit(`u:${msg.to}`, 'message', msg);
    emit('admin', 'intercept', msg);
  },

  join(socket, user, ip, ua) {
    if (!online.has(user.id)) online.set(user.id, new Set());
    online.get(user.id).add(socket.id);
    meta.set(socket.id, { socketId: socket.id, userId: user.id, username: user.username, ip, ua, since: Date.now() });
  },
  leave(socket) {
    const m = meta.get(socket.id);
    meta.delete(socket.id);
    if (!m) return null;
    const set = online.get(m.userId);
    if (set) { set.delete(socket.id); if (!set.size) online.delete(m.userId); }
    return m;
  },
  isOnline: (id) => online.has(id),
  onlineIds: () => [...online.keys()],
  connections: () => [...meta.values()],

  /** Force-disconnect every socket of a user (kick / ban). */
  async kick(userId, reason = 'TERMINATED BY OPERATOR') {
    if (!io) return 0;
    const sockets = await io.in(`u:${userId}`).fetchSockets();
    for (const s of sockets) { s.emit('force-logout', { reason }); s.disconnect(true); }
    return sockets.length;
  },
};
