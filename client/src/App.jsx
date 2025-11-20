import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Chat from './components/Chat';
import { connectSocket, joinWithAck, getIo, disconnectSocket } from './services/socket';

export default function App() {
  const [username, setUsername] = useState(() => localStorage.getItem('username') || '');
  const [connected, setConnected] = useState(false);
  const [initialHistory, setInitialHistory] = useState(null);

  useEffect(() => {
    const io = getIo();
    if (!io) return;
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    io.on('connect', onConnect);
    io.on('disconnect', onDisconnect);
    return () => {
      io.off('connect', onConnect);
      io.off('disconnect', onDisconnect);
    };
  }, []);

  const handleLogin = async (name) => {
    try {
      // initialize socket if needed
      connectSocket(name);
      // wait a tick for socket to be available (socket instance exists immediately)
      const history = await joinWithAck(name); // will throw if username taken
      setInitialHistory(history);
      setUsername(name);
      localStorage.setItem('username', name);
    } catch (err) {
      if (err && err.code === 'username_taken') {
        alert('Username already taken. Choose another.');
      } else {
        alert('Failed to join: ' + (err.message || err));
      }
      disconnectSocket();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('username');
    setUsername('');
    setInitialHistory(null);
    disconnectSocket();
  };

  return (
    <div className="app">
      <header>
        <h1>Real-time Chat</h1>
        {username && <div className="meta">User: <strong>{username}</strong> {connected ? '🟢' : '🔴'}</div>}
      </header>

      {!username ? (
        <Login onLogin={handleLogin} />
      ) : (
        // Pass initialHistory into Chat by injecting global messages at mount
        <Chat username={username} onLogout={handleLogout} initialHistory={initialHistory} />
      )}
    </div>
  );
}
