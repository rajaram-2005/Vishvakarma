'use client';

import { useState } from 'react';
import { studioClient } from '@/lib/studio-client';

export default function ChatPage() {
  const [text, setText] = useState('Research solar EV charging');
  const [out, setOut] = useState<{ completed: string[]; failed: string[] } | null>(null);

  async function send() {
    setOut(await studioClient.chat(text));
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', color: '#e6edf3', background: '#0b0f1a', minHeight: '100vh' }}>
      <h1>Chat</h1>
      <p>The universal entry point — runs through the ONE CORE task graph.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ width: '70%', minHeight: 60, padding: 8 }} />
      <div>
        <button onClick={send} style={{ padding: 8, marginTop: 8 }}>Send</button>
      </div>
      {out && (
        <section>
          <h3>Completed</h3>
          <ul>{out.completed.map((n) => <li key={n}>{n}</li>)}</ul>
          {out.failed.length > 0 && <p>Failed: {out.failed.join(', ')}</p>}
        </section>
      )}
    </main>
  );
}
