import React, { useState } from 'react';

export default function Login({ onLogin }) {
  const [name, setName] = useState('');

  function submit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return alert('Enter a username');
    onLogin(trimmed);
  }

  return (
    <div className="login">
      <form onSubmit={submit}>
        <label>
          Enter username
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </label>
        <button type="submit">Join Chat</button>
      </form>
    </div>
  );
}
