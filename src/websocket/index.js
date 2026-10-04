const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { allowedOrigins } = require('../config/cors');
const { User } = require('../models');

let io;

function configureSocket(server) {
  const origins = allowedOrigins();
  io = new Server(server, { cors: { origin: origins, credentials: true } });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
      if (payload.type !== 'access') throw new Error('Invalid token type');
      const user = await User.findByPk(payload.sub, { attributes: ['id', 'status'] });
      if (!user || user.status !== 'active') throw new Error('Inactive user');
      socket.userId = String(payload.sub);
      return next();
    } catch {
      return next(new Error('Authentication required'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
    socket.emit('connection:ready', { connected: true });
  });

  return io;
}

function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

function disconnectUser(userId, reason = 'session_revoked') {
  if (!io) return;
  const room = `user:${userId}`;
  io.to(room).emit('session:revoked', { reason });
  io.in(room).disconnectSockets(true);
}

module.exports = { configureSocket, emitToUser, disconnectUser };
