// server/index.js
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ---- In-memory storage ----
const MAX_HISTORY = 20; // last N messages to keep
const globalMessages = []; // array of { id, from, text, timestamp, private, to }
const privateMessages = new Map(); // key: conversationKey (sorted "a|b"), value: [messages]
const onlineUsers = new Map(); // socketId -> { username }

// helper for conversation key
function conversationKey(a, b) {
  return [a, b].sort().join('|');
}

function pushGlobalMessage(msg) {
  globalMessages.push(msg);
  if (globalMessages.length > MAX_HISTORY) globalMessages.shift();
}

function pushPrivateMessage(key, msg) {
  const arr = privateMessages.get(key) || [];
  arr.push(msg);
  if (arr.length > MAX_HISTORY) arr.shift();
  privateMessages.set(key, arr);
}

// ---- Socket.io logic ----
io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);

  // join attempt: client must provide username, with callback for ack
  socket.on('join', (username, cb) => {
    try {
      if (!username || typeof username !== 'string') {
        return cb && cb({ ok: false, error: 'invalid_username' });
      }
      username = username.trim();
      // prevent duplicate usernames in current onlineUsers
      const nameExists = Array.from(onlineUsers.values()).some(u => u.username === username);
      if (nameExists) {
        return cb && cb({ ok: false, error: 'username_taken' });
      }

      socket.username = username;
      onlineUsers.set(socket.id, { username });

      // send last global history and relevant private history (none yet)
      const history = {
        global: globalMessages.slice(), // copy
      };

      // notify everyone about new online list and join
      io.emit('online-users', Array.from(onlineUsers.values()).map(u => u.username));
      io.emit('notification', { type: 'join', user: username });

      // ack success and include history
      cb && cb({ ok: true, history });

      console.log(`${username} joined (socket ${socket.id})`);
    } catch (err) {
      console.error('join error', err);
      cb && cb({ ok: false, error: 'server_error' });
    }
  });

  // handle messages
  // payload: { tempId (optional), text, timestamp, to (optional) }
  socket.on('message', (payload, cb) => {
    try {
      if (!socket.username) {
        return cb && cb({ ok: false, error: 'not_authenticated' });
      }
      const from = socket.username;
      const { text } = payload || {};
      if (!text || typeof text !== 'string' || !text.trim()) {
        return cb && cb({ ok: false, error: 'empty_message' });
      }

      const timestamp = payload.timestamp || Date.now();
      // create server message id
      const serverId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

      const message = {
        id: serverId,
        from,
        text: text.trim(),
        timestamp,
        private: !!payload.to,
        to: payload.to || null
      };

      if (message.private) {
        // find recipient socket
        const recipientEntry = Array.from(onlineUsers.entries())
          .find(([id, info]) => info.username === message.to);
        if (!recipientEntry) {
          // recipient offline
          cb && cb({ ok: false, error: 'recipient_offline' });
          return;
        }
        // store private message
        const key = conversationKey(from, message.to);
        pushPrivateMessage(key, message);

        // deliver to recipient and sender
        const [recipientSocketId] = recipientEntry;
        io.to(recipientSocketId).emit('private-message', message);
        socket.emit('private-message', message); // echo
        // ack back to sender with serverId
        cb && cb({ ok: true, id: serverId, timestamp });
      } else {
        // global message
        pushGlobalMessage(message);
        io.emit('message', message);
        cb && cb({ ok: true, id: serverId, timestamp });
      }
    } catch (err) {
      console.error('message handling error', err);
      cb && cb({ ok: false, error: 'server_error' });
    }
  });

  // typing indicator
  socket.on('typing', (isTyping) => {
    if (!socket.username) return;
    socket.broadcast.emit('typing', { user: socket.username, isTyping: !!isTyping });
  });

  // request private history (optional)
  socket.on('get-private-history', ({ withUser }, cb) => {
    try {
      if (!socket.username) return cb && cb({ ok: false, error: 'not_authenticated' });
      if (!withUser) return cb && cb({ ok: false, error: 'invalid_request' });
      const key = conversationKey(socket.username, withUser);
      const arr = privateMessages.get(key) || [];
      cb && cb({ ok: true, history: arr.slice() });
    } catch (err) {
      cb && cb({ ok: false, error: 'server_error' });
    }
  });

  socket.on('disconnect', () => {
    const username = socket.username || 'Unknown';
    onlineUsers.delete(socket.id);
    io.emit('online-users', Array.from(onlineUsers.values()).map(u => u.username));
    io.emit('notification', { type: 'leave', user: username });
    console.log('Socket disconnected', socket.id, username);
  });

  // health ack
  socket.on('ack', (cb) => {
    cb && cb({ ok: true, serverTime: Date.now() });
  });
});

// basic HTTP route
app.get('/', (req, res) => {
  res.send({ status: 'ok', timestamp: Date.now() });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
