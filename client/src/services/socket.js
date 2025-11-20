// client/src/services/socket.js
import { io } from 'socket.io-client';

let socket = null;

export function connectSocket(username) {
  if (socket) return socket;
  const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';
  socket = io(SERVER_URL, { autoConnect: true });

  // We do NOT auto-emit join here; the caller should call joinWithAck
  return socket;
}

export function joinWithAck(username) {
  return new Promise((resolve, reject) => {
    if (!socket) return reject(new Error('socket_not_initialized'));
    // emit join and expect ack: cb({ ok: true, history }) or { ok:false, error }
    socket.emit('join', username, (res) => {
      if (!res) return reject(new Error('no_response'));
      if (res.ok) return resolve(res.history);
      const err = new Error(res.error || 'join_failed');
      err.code = res.error;
      return reject(err);
    });
  });
}

export function getIo() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
