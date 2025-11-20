import React, { useEffect, useState, useRef } from 'react';
import { getIo } from '../services/socket';

export default function Chat({ username, onLogout }) {
  const [messages, setMessages] = useState([]); // { id|tempId, from, text, timestamp, private, to, status }
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [input, setInput] = useState('');
  const [typingUsers, setTypingUsers] = useState(new Set());
  const messagesRef = useRef(null);
  const io = getIo();
  // inside Chat component, after const io = getIo();
useEffect(() => {
  if (!io) return;
  // if App passed history on join
  if (typeof (arguments) !== 'undefined' && !Array.isArray) {}
}, []);

  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    if (!io) return;
    // Handlers
    const onMessage = (msg) => {
      // delivered global message
      setMessages((m) => [...m, { ...msg, status: 'delivered' }]);
    };
    const onPrivate = (msg) => {
      setMessages((m) => [...m, { ...msg, status: 'delivered', private: true }]);
    };
    const onOnline = (list) => setOnlineUsers(list);
    const onTyping = ({ user, isTyping }) => {
      setTypingUsers((s) => {
        const copy = new Set(Array.from(s));
        if (isTyping) copy.add(user);
        else copy.delete(user);
        return copy;
      });
    };
    const onNotification = (data) => {
      setMessages((m) => [...m, { id: `sys-${Date.now()}`, from: 'system', text: `${data.user} ${data.type === 'join' ? 'joined' : 'left'}`, timestamp: Date.now(), status: 'delivered' }]);
    };

    io.on('message', onMessage);
    io.on('private-message', onPrivate);
    io.on('online-users', onOnline);
    io.on('typing', onTyping);
    io.on('notification', onNotification);

    return () => {
      io.off('message', onMessage);
      io.off('private-message', onPrivate);
      io.off('online-users', onOnline);
      io.off('typing', onTyping);
      io.off('notification', onNotification);
    };
  }, [io]);

  // scroll to bottom when messages change
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  // send message with ack
  function sendMessage(e) {
    e?.preventDefault();
    if (!input.trim()) return;
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const payload = { tempId, text: input.trim(), timestamp: Date.now() };
    // add pending message locally
    setMessages((m) => [...m, { tempId, from: username, text: payload.text, timestamp: payload.timestamp, status: 'pending', private: false }]);
    setInput('');
    // clear typing
    io.emit('typing', false);

    // emit with acknowledgement (callback)
    io.emit('message', payload, (res) => {
      if (res && res.ok) {
        // update the message with server id and delivered status
        setMessages((arr) => arr.map(msg => {
          if (msg.tempId && msg.tempId === tempId) {
            return { ...msg, id: res.id, status: 'delivered', timestamp: res.timestamp };
          }
          return msg;
        }));
      } else {
        // failed - mark as failed
        setMessages((arr) => arr.map(msg => {
          if (msg.tempId && msg.tempId === tempId) {
            return { ...msg, status: 'failed' };
          }
          return msg;
        }));
        alert('Message failed to send: ' + (res && res.error ? res.error : 'unknown'));
      }
    });
  }

  // send private message (with ack)
  function sendPrivate(to) {
    const text = prompt(`Private message to ${to}:`);
    if (!text) return;
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const payload = { tempId, text, to, timestamp: Date.now() };
    setMessages((m) => [...m, { tempId, from: username, text, timestamp: payload.timestamp, status: 'pending', private: true, to }]);
    io.emit('message', payload, (res) => {
      if (res && res.ok) {
        setMessages((arr) => arr.map(msg => {
          if (msg.tempId && msg.tempId === tempId) {
            return { ...msg, id: res.id, status: 'delivered', timestamp: res.timestamp };
          }
          return msg;
        }));
      } else {
        setMessages((arr) => arr.map(msg => {
          if (msg.tempId && msg.tempId === tempId) {
            return { ...msg, status: 'failed' };
          }
          return msg;
        }));
        alert('Private message failed: ' + (res && res.error ? res.error : 'unknown'));
      }
    });
  }

  // input change -> typing
  function onInputChange(e) {
    setInput(e.target.value);
    io.emit('typing', true);
    window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      io.emit('typing', false);
    }, 800);
  }

  // handler to load history AFTER join (the parent should call join and then render Chat)
  // But for safety, request history from server on mount (if server sent via join ack it's handled by App)
  useEffect(() => {
    // no-op: history is injected by App on join via props when successful (see App changes)
  }, []);

  return (
    <div className="chat">
      <div className="sidebar">
        <h3>Online</h3>
        <ul>
          {onlineUsers.map((u) => (
            <li key={u}>
              {u} {u === username ? '(you)' : ''}
              {u !== username && <button onClick={() => sendPrivate(u)}>PM</button>}
            </li>
          ))}
        </ul>
        <button onClick={onLogout}>Logout</button>
      </div>

      <div className="main">
        <div className="messages" ref={messagesRef}>
          {messages.map((m, i) => (
            <div key={m.id || m.tempId || i} className={`message ${m.from === username ? 'mine' : ''}`}>
              <div className="meta">
                {m.from} <small>{new Date(m.timestamp).toLocaleTimeString()}</small>
                {m.private ? ' 🔒' : ''}
                {' '}
                {m.status === 'pending' && <em> (sending...)</em>}
                {m.status === 'delivered' && <span> ✔</span>}
                {m.status === 'failed' && <span> ❌</span>}
              </div>
              <div className="text">{m.text}</div>
            </div>
          ))}
        </div>

        <div className="typing">
          {Array.from(typingUsers).filter(u => u !== username).map((u) => (<div key={u}>{u} is typing…</div>))}
        </div>

        <form className="composer" onSubmit={sendMessage}>
          <input value={input} onChange={onInputChange} placeholder="Type a message..." />
          <button type="submit">Send</button>
        </form>
      </div>
    </div>
  );
}
