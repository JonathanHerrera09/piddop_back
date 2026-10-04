const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { allowedOrigins } = require('../config/cors');

let io;

function configureSocket(server) {
  const origins = allowedOrigins();
  io = new Server(server, { cors: { origin: origins, credentials: true } });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      if (payload.type !== 'access') throw new Error('Invalid token type');
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

module.exports = { configureSocket, emitToUser };
